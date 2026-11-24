-- ============================================================
-- QOVENTO — TODO junto (correr UNA sola vez en el SQL Editor de Supabase; es seguro repetirlo):
--   1) Ingresos de capital     (ingresos_capital_supabase.sql)
--   2) Fotos reales de equipos (dispositivo_fotos_supabase.sql)
-- ============================================================

-- ============================================================
-- QOVENTO — Ingresos de capital (la contracara de Egresos): plata que entra al negocio sin ser una venta,
-- por ejemplo un aporte de capital del dueño o de un socio, o un préstamo recibido.
-- Si entra en efectivo a una caja, suma al efectivo esperado del turno de esa caja (arqueo).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- Requiere haber corrido antes caja_vuelto_separado_supabase.sql y egresos_duenos_supabase.sql.
-- ============================================================

create table if not exists ingresos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  fecha date not null default current_date,
  tipo text not null default 'aporte_capital',   -- aporte_capital | prestamo | otro
  descripcion text not null,
  importe numeric not null,
  moneda text not null default 'ARS',
  medio_pago text not null default 'efectivo',   -- efectivo | transferencia | debito | credito | ...
  caja_tipo text not null default 'venta_diaria', -- en qué caja entró (solo importa si es efectivo): venta_diaria | financiamiento
  sucursal_id uuid references sucursales(id) on delete set null,
  aportado_por text,                              -- quién puso la plata (dueño, socio...)
  notas text,
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingresos_importe_positivo check (importe > 0),
  constraint ingresos_descripcion_no_vacia check (length(trim(descripcion)) > 0),
  constraint ingresos_tipo_valido check (tipo in ('aporte_capital', 'prestamo', 'otro')),
  constraint ingresos_caja_tipo_valido check (caja_tipo in ('venta_diaria', 'financiamiento'))
);
create index if not exists idx_ingresos_negocio on ingresos(negocio_id, fecha desc) where not anulado;

alter table ingresos enable row level security;
drop policy if exists "ingresos de mi negocio" on ingresos;
create policy "ingresos de mi negocio" on ingresos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- caja_cerrar_turno: igual que en egresos_duenos_supabase.sql, pero el efectivo esperado también suma los
-- ingresos de capital en efectivo que entraron a esa caja durante el turno.
create or replace function caja_cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado numeric,
  p_observacion text default null,
  p_cerrada_por text default null,
  p_efectivo_vuelto numeric default null
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_caja cajas;
  v_total_efectivo numeric;
  v_ingresos_efectivo numeric;
  v_esperado numeric;
  v_vuelto numeric;
  v_retiro numeric;
  v_categoria uuid;
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

  select coalesce(sum(importe), 0) into v_ingresos_efectivo
  from ingresos
  where negocio_id = negocio_actual()
    and caja_tipo = v_caja.tipo
    and medio_pago = 'efectivo'
    and moneda = v_turno.moneda
    and not anulado
    and created_at >= v_turno.abierta_en
    and created_at <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_esperado := v_turno.efectivo_inicial + v_total_efectivo + v_ingresos_efectivo;

  v_vuelto := coalesce(p_efectivo_vuelto, p_efectivo_declarado);
  v_retiro := greatest(0, p_efectivo_declarado - v_vuelto);

  update caja_turnos
  set estado = 'cerrada',
      cerrada_en = now(),
      cerrada_por = p_cerrada_por,
      efectivo_declarado = p_efectivo_declarado,
      efectivo_vuelto = v_vuelto,
      efectivo_esperado = v_esperado,
      diferencia = p_efectivo_declarado - v_esperado,
      observacion = p_observacion
  where id = p_turno_id
  returning * into v_turno;

  if v_retiro > 0.009 then
    select id into v_categoria from egresos_categorias
     where negocio_id = negocio_actual() and rol = 'traslado_arqueo' and not archivada limit 1;
    if v_categoria is null then
      begin
        insert into egresos_categorias (negocio_id, nombre, orden, rol)
        values (negocio_actual(), 'Traslado / arqueo', 99, 'traslado_arqueo')
        returning id into v_categoria;
      exception when unique_violation then
        select id into v_categoria from egresos_categorias
         where negocio_id = negocio_actual() and lower(nombre) = 'traslado / arqueo' and not archivada limit 1;
      end;
    end if;

    insert into egresos (negocio_id, sucursal_id, caja_turno_id, categoria_id, tipo, descripcion, importe, moneda, medio_pago, registrado_por_nombre)
    values (
      negocio_actual(),
      v_caja.sucursal_id,
      p_turno_id,
      v_categoria,
      'retiro',
      'Retiro de caja al cerrar el turno N° ' || v_turno.numero || ' de ' || v_caja.nombre,
      v_retiro,
      v_turno.moneda,
      'efectivo',
      p_cerrada_por
    );
  end if;

  return v_turno;
end;
$$;


-- ============================================================
-- QOVENTO — Fotos reales de cada celular (opcionales): hasta 8 por equipo, con una miniatura chica para listas.
-- Van en su propia tabla (no en `dispositivos`) para que los listados de Stock no carguen imágenes pesadas.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
create table if not exists dispositivo_fotos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  foto_url text not null,          -- foto reducida (máx. ~1280 px)
  miniatura_url text,              -- miniatura (~320 px)
  orden int not null default 0,    -- la de menor "orden" es la principal
  actor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dispositivo_fotos_dispositivo on dispositivo_fotos(dispositivo_id, orden);

alter table dispositivo_fotos enable row level security;
drop policy if exists "dispositivo_fotos de mi negocio" on dispositivo_fotos;
create policy "dispositivo_fotos de mi negocio" on dispositivo_fotos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());
