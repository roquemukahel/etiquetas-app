-- ============================================================
-- CAJA: auto-apertura con la primera venta (2026-09-04) — pedido de un
-- cliente, relayado por roque.
--
-- Hasta ahora, cerrar un turno abría el siguiente EN EL ACTO (ver
-- caja_cerrar_turno en caja_supabase.sql), arrastrando el efectivo
-- declarado como inicial del que sigue. El pedido es distinto: que la caja
-- quede CERRADA de verdad después del cierre (ej. de 22hs a 9hs) y recién
-- se abra sola en el momento de la primera venta del día siguiente — sin
-- que nadie tenga que tocar un botón "Abrir caja".
--
-- El "efectivo declarado" (vuelto) que ya se guarda en cada cierre sigue
-- siendo la fuente del inicial del turno siguiente — no hace falta una
-- columna nueva, solo dejar de abrirlo antes de tiempo y abrirlo recién
-- cuando hace falta de verdad.
-- ============================================================

-- caja_cerrar_turno: igual que antes, pero SIN el auto-open del turno
-- siguiente al final — la caja queda cerrada hasta la próxima venta.
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

  -- Antes acá se abría el turno siguiente en el acto (perform
  -- caja_abrir_turno(...)) — ahora la caja queda cerrada de verdad; el
  -- siguiente turno lo abre solo pagos_auto_abrir_caja() cuando llegue la
  -- primera venta, usando este mismo efectivo_declarado como inicial (ver
  -- caja_asegurar_turno_abierto más abajo).
  return v_turno;
end;
$$;

-- ============================================================
-- caja_asegurar_turno_abierto: si la caja ya tiene un turno abierto, lo
-- devuelve tal cual (mismo criterio idempotente que caja_abrir_turno). Si
-- no, abre uno nuevo usando como inicial el efectivo_declarado (vuelto) del
-- último cierre de ESA caja — o 0 si la caja nunca se cerró todavía (recién
-- creada). Es lo que reemplaza al botón manual "Abrir caja" para el uso
-- diario: se llama sola desde pagos_auto_abrir_caja() con cada venta.
-- ============================================================
create or replace function caja_asegurar_turno_abierto(
  p_caja_id uuid,
  p_por text default null,
  p_moneda_default text default 'ARS'
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_ultimo_cerrado caja_turnos;
begin
  select * into v_ultimo_cerrado
    from caja_turnos
    where caja_id = p_caja_id and estado = 'cerrada'
    order by numero desc
    limit 1;

  -- caja_abrir_turno ya es idempotente (si hay un turno abierto, lo
  -- devuelve sin tocarlo) — no hace falta repetir ese chequeo acá.
  return caja_abrir_turno(
    p_caja_id,
    coalesce(v_ultimo_cerrado.efectivo_declarado, 0),
    coalesce(v_ultimo_cerrado.moneda, p_moneda_default),
    p_por
  );
end;
$$;

-- ============================================================
-- Trigger en `pagos`: cualquier pago que se registre con caja_tipo cargado
-- (venta cobrada, cuota, abono de cuenta corriente — todos los puntos de
-- venta ya lo mandan, ver app/ordenes/nueva, app/ordenes/[id],
-- app/clientes/[id]) asegura que la caja correspondiente (misma sucursal)
-- tenga un turno abierto ANTES de guardarse — así funciona sin importar
-- desde qué pantalla se cobre, sin tener que acordarse de llamarlo desde
-- cada lugar del código que inserta un pago.
--
-- BEFORE INSERT (no AFTER): así el turno ya existe con abierta_en <= fecha
-- del pago en el momento en que el pago se guarda — evita una ventana
-- donde el pago exista pero no pertenezca todavía a ningún turno abierto.
-- ============================================================
create or replace function pagos_auto_abrir_caja()
returns trigger
language plpgsql
security definer
as $$
declare
  v_caja_id uuid;
begin
  if new.caja_tipo is null then
    return new;
  end if;

  select id into v_caja_id from cajas
    where negocio_id = new.negocio_id
      and tipo = new.caja_tipo
      and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(new.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_caja_id is null then
    -- Primera venta de esta sucursal antes de que alguien haya entrado
    -- alguna vez a la pantalla de Caja (que es lo que normalmente crea las
    -- 2 cajas fijas) — las creamos acá para no perder la apertura
    -- automática por este detalle de orden.
    perform caja_asegurar_predeterminadas(new.sucursal_id);
    select id into v_caja_id from cajas
      where negocio_id = new.negocio_id
        and tipo = new.caja_tipo
        and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(new.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  if v_caja_id is not null then
    perform caja_asegurar_turno_abierto(v_caja_id, new.registrado_por_nombre, new.moneda);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pagos_auto_abrir_caja on pagos;
create trigger trg_pagos_auto_abrir_caja
before insert on pagos
for each row execute function pagos_auto_abrir_caja();
