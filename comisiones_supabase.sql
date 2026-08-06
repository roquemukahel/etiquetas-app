-- ============================================================
-- QOVENTO — Módulo de COMISIONES para vendedores
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. NO borra ni altera ventas existentes.
-- Alcance: SOLO comisiones. No toca intereses, cuotas ni financiación.
-- ============================================================

-- ---------- Config del negocio (todo apagado por defecto) ----------
alter table negocios add column if not exists comisiones_activas boolean not null default false;
alter table negocios add column if not exists comisiones_desde date;              -- vigencia: no comisiona ventas anteriores
alter table negocios add column if not exists comisiones_generar_en text not null default 'confirmada'; -- 'confirmada' | 'cobrada'
alter table negocios add column if not exists comision_plan_default_id uuid;      -- plan predeterminado del negocio

-- ---------- Clasificación de la venta (no existía) ----------
alter table ordenes add column if not exists tipo_venta text not null default 'minorista'; -- 'minorista' | 'mayorista'

-- ---------- Snapshot de costo por línea (para comisión sobre ganancia) ----------
-- Solo se completa en ventas NUEVAS al vender. Las viejas quedan en null y no
-- generan comisión sobre ganancia (nunca se inventa un costo).
alter table orden_items add column if not exists costo numeric;

-- ---------- Producto de catálogo por línea (para reglas por producto) ----------
-- orden_items ya tiene dispositivo_id (celulares); esto enlaza los accesorios
-- del catálogo (tabla productos), para poder aplicar una regla a un producto.
alter table orden_items add column if not exists producto_id uuid references productos(id) on delete set null;

-- ============================================================
-- PLANES de comisión (reutilizables por negocio)
-- ============================================================
create table if not exists comision_planes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  es_default boolean not null default false,
  vigencia_desde date,
  vigencia_hasta date,
  version int not null default 1,          -- sube al editar reglas; los movimientos guardan la versión aplicada
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_comision_planes_negocio on comision_planes(negocio_id);

-- ============================================================
-- REGLAS de un plan
-- tipo_calculo: porcentaje_venta | porcentaje_ganancia | fijo_por_unidad | fijo_por_venta
-- alcance:      todas | minorista | mayorista | tipo_item | producto
-- ============================================================
create table if not exists comision_reglas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  plan_id uuid not null references comision_planes(id) on delete cascade,
  tipo_calculo text not null,
  valor numeric not null default 0,        -- porcentaje (0..100) o importe fijo
  alcance text not null default 'todas',
  tipo_item text,                          -- si alcance = tipo_item (dispositivo/producto/trabajo)
  producto_id uuid references productos(id) on delete set null, -- si alcance = producto
  prioridad int not null default 0,        -- desempate explícito
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_comision_reglas_plan on comision_reglas(plan_id);

-- ============================================================
-- ASIGNACIÓN de vendedores a planes
-- Un vendedor con asignación activa usa ese plan; si no, el plan default.
-- ============================================================
create table if not exists comision_plan_vendedores (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  plan_id uuid not null references comision_planes(id) on delete cascade,
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  activo boolean not null default true,
  vigencia_desde date,
  vigencia_hasta date,
  created_at timestamptz not null default now()
);
-- Una sola asignación ACTIVA por vendedor (evita dos planes contradictorios).
create unique index if not exists uq_comision_plan_vendedor_activo
  on comision_plan_vendedores(negocio_id, vendedor_id) where activo;

-- ============================================================
-- LIQUIDACIONES (una por vendedor y período)
-- ============================================================
create table if not exists comision_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  vendedor_id uuid not null references vendedores(id) on delete restrict,
  periodo_desde date,
  periodo_hasta date,
  estado text not null default 'borrador', -- borrador | confirmada | parcial | pagada | anulada
  total_bruto numeric not null default 0,
  total_neto numeric not null default 0,
  pagado numeric not null default 0,
  moneda text,
  observaciones text,
  creado_por text,
  created_at timestamptz not null default now(),
  confirmada_at timestamptz,
  pagada_at timestamptz
);
create index if not exists idx_comision_liq_negocio on comision_liquidaciones(negocio_id, vendedor_id);

-- ============================================================
-- MOVIMIENTOS: libro inmutable y auditable (nunca se borra)
-- tipo_movimiento: comision | reversion | ajuste_positivo | ajuste_negativo
-- estado:          generada | aprobada | en_liquidacion | pagada | revertida
-- ============================================================
create table if not exists comision_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  vendedor_id uuid not null references vendedores(id) on delete restrict,
  orden_id uuid references ordenes(id) on delete set null,
  orden_item_id uuid references orden_items(id) on delete set null,
  producto_id uuid,                        -- histórico (no fk dura, se conserva aunque se borre el producto)
  tipo_item text,                          -- histórico
  tipo_venta text,                         -- minorista | mayorista (histórico)
  tipo_movimiento text not null default 'comision',
  fecha_hecho timestamptz,                 -- fecha del hecho comercial (created_at de la orden)
  base numeric not null default 0,
  valor_regla numeric,                     -- % o importe fijo aplicado
  participacion numeric not null default 100, -- % del vendedor en la venta compartida
  comision numeric not null default 0,     -- resultado (negativo en reversiones/ajustes negativos)
  moneda text,
  plan_id uuid,
  plan_version int,
  regla_id uuid,
  regla_snapshot jsonb,                    -- foto legible de la regla aplicada (no cambia si luego se edita)
  estado text not null default 'generada',
  movimiento_original_id uuid references comision_movimientos(id) on delete set null, -- reversión → original
  liquidacion_id uuid references comision_liquidaciones(id) on delete set null,
  motivo text,
  usuario text,
  -- Clave de idempotencia: la generación de la comisión ORIGINAL la setea
  -- (ej. "<orden>:<linea>:<vendedor>") para que el mismo evento no genere dos
  -- veces. Reversiones y ajustes la dejan en null (son movimientos separados a
  -- propósito, no idempotentes).
  idempotency_key text,
  created_at timestamptz not null default now(),
  aprobada_at timestamptz,
  pagada_at timestamptz
);
create index if not exists idx_comision_mov_negocio on comision_movimientos(negocio_id, vendedor_id);
create index if not exists idx_comision_mov_orden on comision_movimientos(orden_id);
create index if not exists idx_comision_mov_estado on comision_movimientos(negocio_id, estado);
create index if not exists idx_comision_mov_liq on comision_movimientos(liquidacion_id);
-- IDEMPOTENCIA: el mismo evento de generación no puede crear dos comisiones.
create unique index if not exists uq_comision_mov_idem
  on comision_movimientos(idempotency_key) where idempotency_key is not null;

-- ============================================================
-- PAGOS de una liquidación (pagos parciales por separado)
-- ============================================================
create table if not exists comision_liquidacion_pagos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  liquidacion_id uuid not null references comision_liquidaciones(id) on delete cascade,
  monto numeric not null,
  medio text,
  referencia text,
  fecha timestamptz not null default now(),
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists idx_comision_liq_pagos on comision_liquidacion_pagos(liquidacion_id);

-- ============================================================
-- RLS: cada negocio ve/edita SOLO lo suyo (aislamiento multitenant)
-- ============================================================
alter table comision_planes enable row level security;
alter table comision_reglas enable row level security;
alter table comision_plan_vendedores enable row level security;
alter table comision_movimientos enable row level security;
alter table comision_liquidaciones enable row level security;
alter table comision_liquidacion_pagos enable row level security;

drop policy if exists "comision_planes negocio" on comision_planes;
create policy "comision_planes negocio" on comision_planes
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "comision_reglas negocio" on comision_reglas;
create policy "comision_reglas negocio" on comision_reglas
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "comision_plan_vendedores negocio" on comision_plan_vendedores;
create policy "comision_plan_vendedores negocio" on comision_plan_vendedores
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "comision_movimientos negocio" on comision_movimientos;
create policy "comision_movimientos negocio" on comision_movimientos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "comision_liquidaciones negocio" on comision_liquidaciones;
create policy "comision_liquidaciones negocio" on comision_liquidaciones
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "comision_liquidacion_pagos negocio" on comision_liquidacion_pagos;
create policy "comision_liquidacion_pagos negocio" on comision_liquidacion_pagos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- Nota: la restricción "un vendedor ve solo SUS comisiones" se aplica en la capa
-- de aplicación (el actor no es un usuario de auth propio, es un vendedor elegido
-- con permisos). El aislamiento por NEGOCIO ya lo garantiza RLS acá.

-- ============================================================
-- FASE 5 — Operaciones ATÓMICAS (security definer + filtro por negocio_actual)
-- Las transiciones de estado se validan acá (backend), no en el navegador.
-- ============================================================

-- Crear una liquidación con TODOS los movimientos 'aprobada' de un vendedor en
-- el rango. Atómico: crea la liquidación y vincula los movimientos.
create or replace function comision_crear_liquidacion(p_vendedor uuid, p_desde date, p_hasta date)
returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_liq uuid;
  v_bruto numeric := 0;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  select coalesce(sum(comision), 0) into v_bruto
  from comision_movimientos
  where negocio_id = v_negocio and vendedor_id = p_vendedor and estado = 'aprobada'
    and (p_desde is null or fecha_hecho >= p_desde)
    and (p_hasta is null or fecha_hecho < (p_hasta + 1));

  if v_bruto is null then v_bruto := 0; end if;

  insert into comision_liquidaciones (negocio_id, vendedor_id, periodo_desde, periodo_hasta, estado, total_bruto, total_neto)
  values (v_negocio, p_vendedor, p_desde, p_hasta, 'confirmada', v_bruto, v_bruto)
  returning id into v_liq;

  update comision_movimientos
    set estado = 'en_liquidacion', liquidacion_id = v_liq
  where negocio_id = v_negocio and vendedor_id = p_vendedor and estado = 'aprobada'
    and (p_desde is null or fecha_hecho >= p_desde)
    and (p_hasta is null or fecha_hecho < (p_hasta + 1));

  return v_liq;
end $$;

-- Registrar un pago (parcial) de una liquidación. Recalcula pagado/estado.
create or replace function comision_registrar_pago(p_liquidacion uuid, p_monto numeric, p_medio text, p_referencia text, p_usuario text)
returns void language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_neto numeric;
  v_pagado numeric;
  v_estado text;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  select total_neto into v_neto from comision_liquidaciones where id = p_liquidacion and negocio_id = v_negocio;
  if v_neto is null then raise exception 'Liquidación no encontrada'; end if;

  insert into comision_liquidacion_pagos (negocio_id, liquidacion_id, monto, medio, referencia, usuario)
  values (v_negocio, p_liquidacion, p_monto, p_medio, p_referencia, p_usuario);

  select coalesce(sum(monto), 0) into v_pagado from comision_liquidacion_pagos where liquidacion_id = p_liquidacion;
  v_estado := case when v_pagado >= v_neto then 'pagada' when v_pagado > 0 then 'parcial' else 'confirmada' end;

  update comision_liquidaciones
    set pagado = v_pagado, estado = v_estado,
        pagada_at = case when v_estado = 'pagada' then now() else pagada_at end
  where id = p_liquidacion;

  if v_estado = 'pagada' then
    update comision_movimientos set estado = 'pagada', pagada_at = now()
    where liquidacion_id = p_liquidacion and estado = 'en_liquidacion';
  end if;
end $$;

-- Reversión de comisiones de una venta cancelada/devuelta. Crea un movimiento
-- negativo por cada comisión original no revertida. Si el original ya se pagó,
-- NO lo toca (la reversión queda pendiente para descontar en la próxima
-- liquidación); si no, marca el original como 'revertida'.
create or replace function comision_revertir_orden(p_orden uuid, p_motivo text, p_usuario text)
returns int language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_count int := 0;
  r record;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  for r in
    select m.* from comision_movimientos m
    where m.negocio_id = v_negocio and m.orden_id = p_orden
      and m.tipo_movimiento = 'comision' and m.estado <> 'revertida'
      and not exists (select 1 from comision_movimientos rev where rev.movimiento_original_id = m.id)
  loop
    insert into comision_movimientos (negocio_id, vendedor_id, orden_id, orden_item_id, producto_id, tipo_item,
      tipo_venta, tipo_movimiento, fecha_hecho, base, valor_regla, participacion, comision, moneda, plan_id,
      plan_version, regla_id, regla_snapshot, estado, movimiento_original_id, motivo, usuario)
    values (r.negocio_id, r.vendedor_id, r.orden_id, r.orden_item_id, r.producto_id, r.tipo_item,
      r.tipo_venta, 'reversion', r.fecha_hecho, r.base, r.valor_regla, r.participacion, -r.comision, r.moneda, r.plan_id,
      r.plan_version, r.regla_id, r.regla_snapshot, 'generada', r.id, p_motivo, p_usuario);
    if r.estado <> 'pagada' then
      update comision_movimientos set estado = 'revertida' where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
