-- ============================================================
-- MÓDULO CAJA (2026-08-27) — pedido de un cliente, relayado por roque.
--
-- Modelo: dos cajas fijas por sucursal — "Venta diaria" (ventas de
-- productos + pagos de reparaciones) y "Financiamiento" (anticipos de
-- crédito nuevo + cuotas + cobranzas de cuenta corriente). Cada una tiene
-- su propia secuencia de "turnos" (apertura → cierre → arqueo), como un
-- libro de caja clásico: mientras no se cierra, el turno queda "ACTUAL" y
-- sigue sumando; al cerrar, se declara el efectivo contado, se compara
-- contra el esperado, y se abre el turno siguiente solo.
--
-- Ninguna plata se re-registra acá: `pagos` (la tabla que YA es la fuente
-- de verdad de "plata real que entró", ver cuenta_corriente_supabase.sql)
-- gana una columna `caja_tipo` para poder agruparla por caja. El cierre no
-- es más que sumar pagos ya existentes en un rango de fechas — mismo
-- criterio "nunca guardar un total que se puede calcular" que ya usa el
-- saldo de cuenta corriente.
--
-- Modo "unificado" (una sola caja, sin distinguir venta/financiamiento) es
-- un pedido para MÁS ADELANTE — se deja un lugar en `negocios` para esa
-- bandera, pero HOY no cambia nada de la operación (ver comentario en la
-- columna).
-- ============================================================

create table if not exists cajas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  -- null = negocio sin multisucursal activada (una sola caja de cada tipo
  -- para toda la cuenta) — mismo criterio que pagos.sucursal_id.
  sucursal_id uuid references sucursales(id) on delete cascade,
  tipo text not null check (tipo in ('venta_diaria', 'financiamiento')),
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
-- Una sola caja de cada tipo por sucursal (el coalesce trata "sin
-- sucursal" como su propia sucursal virtual, para que el unique index
-- funcione igual con o sin multisucursal activada).
create unique index if not exists uq_cajas_negocio_sucursal_tipo
  on cajas(negocio_id, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo);
create index if not exists idx_cajas_negocio on cajas(negocio_id);

create table if not exists caja_turnos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  caja_id uuid not null references cajas(id) on delete cascade,
  numero bigint not null,
  abierta_en timestamptz not null default now(),
  abierta_por text,
  efectivo_inicial numeric not null default 0,
  moneda text not null default 'ARS',
  cerrada_en timestamptz,
  cerrada_por text,
  efectivo_declarado numeric,
  efectivo_esperado numeric,
  diferencia numeric,
  observacion text,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_at timestamptz not null default now()
);
-- Nunca dos turnos abiertos a la vez para la misma caja — es lo que hace
-- que "abrir" sea idempotente (si ya hay uno abierto, se reusa) y que el
-- cierre sepa sin ambigüedad qué turno está cerrando.
create unique index if not exists uq_caja_turnos_abierto
  on caja_turnos(caja_id) where estado = 'abierta';
create unique index if not exists uq_caja_turnos_numero on caja_turnos(caja_id, numero);
create index if not exists idx_caja_turnos_negocio on caja_turnos(negocio_id);
create index if not exists idx_caja_turnos_caja on caja_turnos(caja_id, numero desc);

-- La columna que conecta la plata real (pagos) con la caja a la que
-- pertenece. Nullable e histórica: los pagos de antes de este módulo
-- quedan sin clasificar (no se puede saber a qué caja hubieran ido), no
-- se fuerza ningún valor por default.
alter table pagos add column if not exists caja_tipo text check (caja_tipo in ('venta_diaria', 'financiamiento'));
create index if not exists idx_pagos_caja_tipo on pagos(negocio_id, caja_tipo, fecha);

-- Lugar para la futura modalidad "caja única" — hoy no lee nadie esta
-- columna todavía (la operación sigue siendo SIEMPRE con las 2 cajas
-- separadas); está para que Configuración pueda mostrar la opción
-- "próximamente" sin que haga falta otra migración cuando se construya.
alter table negocios add column if not exists cajas_modo_unificado boolean not null default false;

alter table cajas enable row level security;
alter table caja_turnos enable row level security;

drop policy if exists "cajas de mi negocio" on cajas;
create policy "cajas de mi negocio" on cajas
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

drop policy if exists "turnos de mi negocio" on caja_turnos;
create policy "turnos de mi negocio" on caja_turnos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- caja_asegurar_predeterminadas: crea (si faltan) las 2 cajas fijas de
-- una sucursal. Idempotente — llamarla de más nunca duplica nada. p_sucursal_id
-- null = negocio sin multisucursal.
-- ============================================================
create or replace function caja_asegurar_predeterminadas(p_sucursal_id uuid default null)
returns void
language plpgsql
security definer
as $$
begin
  insert into cajas (negocio_id, sucursal_id, tipo, nombre)
  values
    (negocio_actual(), p_sucursal_id, 'venta_diaria', 'Venta diaria'),
    (negocio_actual(), p_sucursal_id, 'financiamiento', 'Financiamiento')
  on conflict (negocio_id, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo)
  do nothing;
end;
$$;

-- ============================================================
-- caja_abrir_turno: si la caja YA tiene un turno abierto, lo devuelve tal
-- cual (abrir de más nunca pisa el efectivo inicial ni el responsable ya
-- cargado) — así el botón "Abrir caja" es seguro de tocar más de una vez.
-- El "for update" evita que dos aperturas simultáneas (dos pestañas)
-- generen dos turnos con el mismo número.
-- ============================================================
create or replace function caja_abrir_turno(
  p_caja_id uuid,
  p_efectivo_inicial numeric default 0,
  p_moneda text default 'ARS',
  p_abierta_por text default null
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_negocio uuid;
  v_existente caja_turnos;
  v_siguiente_numero bigint;
  v_nuevo caja_turnos;
begin
  select negocio_id into v_negocio from cajas where id = p_caja_id and negocio_id = negocio_actual();
  if v_negocio is null then
    raise exception 'Caja inexistente o de otro negocio';
  end if;

  perform 1 from cajas where id = p_caja_id for update;

  select * into v_existente from caja_turnos where caja_id = p_caja_id and estado = 'abierta';
  if found then
    return v_existente;
  end if;

  select coalesce(max(numero), 0) + 1 into v_siguiente_numero from caja_turnos where caja_id = p_caja_id;

  insert into caja_turnos (negocio_id, caja_id, numero, efectivo_inicial, moneda, abierta_por)
  values (v_negocio, p_caja_id, v_siguiente_numero, p_efectivo_inicial, p_moneda, p_abierta_por)
  returning * into v_nuevo;

  return v_nuevo;
end;
$$;

-- ============================================================
-- caja_cerrar_turno: cierra el turno ACTUAL calculando el efectivo
-- esperado (inicial + Σ pagos en efectivo de esa caja durante el turno) y
-- guardando la diferencia contra lo declarado. Abre el turno siguiente
-- solo, arrastrando el efectivo declarado como inicial del que sigue
-- (mismo criterio que un cambio de turno real: la plata que quedó en el
-- cajón es con la que arranca el próximo).
-- ============================================================
create or replace function caja_cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado numeric,
  p_observacion text default null,
  p_cerrada_por text default null
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_caja cajas;
  v_total_efectivo numeric;
  v_esperado numeric;
begin
  select * into v_turno from caja_turnos where id = p_turno_id and negocio_id = negocio_actual() for update;
  if not found then
    raise exception 'Turno inexistente o de otro negocio';
  end if;
  if v_turno.estado <> 'abierta' then
    raise exception 'Este turno ya está cerrado';
  end if;

  select * into v_caja from cajas where id = v_turno.caja_id;

  -- "and moneda = v_turno.moneda": sin esto, un negocio que cobra en más de
  -- una moneda sumaba efectivo en pesos y en dólares como si fueran el mismo
  -- número — el arqueo nunca podía cerrar bien. El turno opera en UNA sola
  -- moneda (la que tenía el negocio al abrirlo); pagos en otra moneda quedan
  -- fuera de este cierre (no se pierden, viven en `pagos` igual, pero no
  -- entran en el efectivo esperado de ESTA caja).
  select coalesce(sum(monto), 0) into v_total_efectivo
  from pagos
  where negocio_id = negocio_actual()
    and caja_tipo = v_caja.tipo
    and medio = 'efectivo'
    and moneda = v_turno.moneda
    and not anulado
    and fecha >= v_turno.abierta_en
    and fecha <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_esperado := v_turno.efectivo_inicial + v_total_efectivo;

  update caja_turnos
  set estado = 'cerrada',
      cerrada_en = now(),
      cerrada_por = p_cerrada_por,
      efectivo_declarado = p_efectivo_declarado,
      efectivo_esperado = v_esperado,
      diferencia = p_efectivo_declarado - v_esperado,
      observacion = p_observacion
  where id = p_turno_id
  returning * into v_turno;

  -- Turno siguiente, arrancando con lo que quedó contado en el cajón.
  perform caja_abrir_turno(v_caja.id, p_efectivo_declarado, v_turno.moneda, p_cerrada_por);

  return v_turno;
end;
$$;

-- ============================================================
-- caja_reabrir_turno: deshace un cierre. Solo se puede reabrir el ÚLTIMO
-- cerrado, y únicamente si el turno que se le abrió automáticamente al
-- cerrar todavía está intacto (nadie más lo cerró ni lo tocó) — si ya
-- tiene su propio cierre encima, reabrir el anterior mezclaría dos
-- períodos y rompería la numeración.
-- ============================================================
create or replace function caja_reabrir_turno(p_turno_id uuid)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_siguiente caja_turnos;
begin
  select * into v_turno from caja_turnos where id = p_turno_id and negocio_id = negocio_actual() for update;
  if not found then
    raise exception 'Turno inexistente o de otro negocio';
  end if;
  if v_turno.estado <> 'cerrada' then
    raise exception 'Este turno no está cerrado';
  end if;

  select * into v_siguiente from caja_turnos
    where caja_id = v_turno.caja_id and numero = v_turno.numero + 1 for update;

  if found then
    if v_siguiente.estado <> 'abierta' then
      raise exception 'No se puede reabrir: ya se cerró un turno posterior de esta caja';
    end if;
    delete from caja_turnos where id = v_siguiente.id;
  end if;

  update caja_turnos
  set estado = 'abierta',
      cerrada_en = null,
      cerrada_por = null,
      efectivo_declarado = null,
      efectivo_esperado = null,
      diferencia = null
  where id = p_turno_id
  returning * into v_turno;

  return v_turno;
end;
$$;
