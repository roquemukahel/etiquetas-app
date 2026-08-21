-- ============================================================
-- QOVENTO — Módulo de FINANCIACIÓN PROPIA en cuotas
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. NO borra ni altera ventas, cuenta
-- corriente, pagos ni cuotas (el sistema de recargo por plan de pago que
-- ya existía) existentes.
--
-- Principio de integración: la cuenta corriente (cta_cte_movimientos) SIGUE
-- siendo el libro general de deuda — una venta financiada genera, además
-- del plan y sus cuotas acá, UN cargo por cuota en cta_cte_movimientos
-- (antes era un solo cargo por toda la venta; ahora son varios cargos más
-- chicos, uno por cuota, cada uno con SU PROPIO vencimiento — la suma da
-- exactamente lo mismo que antes). Así el saldo/vencido/estadoCuenta que ya
-- existen (app/lib/cuentaCorriente.ts, saldos_cuenta_corriente()) siguen
-- funcionando SIN TOCARLOS, solo ven cargos más granulares.
-- ============================================================

-- ---------- Vínculo cargo ↔ cuota (nullable, no rompe nada existente) ----------
-- Un cargo de cta_cte_movimientos SIN cuota_id sigue siendo lo de siempre
-- (venta común, ajuste, nota de crédito) — el sistema de financiación es
-- 100% opcional y coexiste con eso.
alter table cta_cte_movimientos add column if not exists cuota_id uuid;

-- ============================================================
-- PLANES de financiación
-- ============================================================
create table if not exists financiacion_planes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  orden_id uuid references ordenes(id) on delete set null,       -- venta de origen (null si en el futuro se convierte un saldo existente)
  moneda text not null default 'ARS',
  importe_original numeric not null,                              -- precio de la venta
  entrega_inicial numeric not null default 0,                      -- anticipo/seña, si hubo
  importe_financiado numeric not null,                             -- importe_original - entrega_inicial (validado, no solo confiado)
  cantidad_cuotas int not null,
  frecuencia text not null default 'mensual',                      -- preparado para el futuro; hoy solo se usa 'mensual'
  primera_cuota_fecha date not null,
  estado text not null default 'activo',                           -- activo | completado | anulado | reprogramado
  observaciones text,
  creado_por text,
  plan_anterior_id uuid references financiacion_planes(id) on delete set null, -- si esto es una reprogramación, apunta al cronograma viejo (que se conserva intacto)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financiacion_planes_importes_positivos check (importe_original > 0 and importe_financiado > 0 and entrega_inicial >= 0),
  constraint financiacion_planes_cuotas_positivas check (cantidad_cuotas > 0)
);
create index if not exists idx_financiacion_planes_negocio on financiacion_planes(negocio_id);
create index if not exists idx_financiacion_planes_cliente on financiacion_planes(negocio_id, cliente_id);
create index if not exists idx_financiacion_planes_orden on financiacion_planes(orden_id);

-- ============================================================
-- CUOTAS de un plan
-- estado PERSISTIDO simple (los 8 estados "visuales" de la spec — próxima a
-- vencer, vencida, parcial, etc. — se DERIVAN en el dominio a partir de
-- fecha_vencimiento/importe_pagado, nunca se guardan como texto congelado).
-- ============================================================
create table if not exists financiacion_cuotas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  plan_id uuid not null references financiacion_planes(id) on delete cascade,
  numero int not null,
  fecha_vencimiento date not null,
  importe_original numeric not null,
  importe_pagado numeric not null default 0,
  estado text not null default 'pendiente',                       -- pendiente | pagada | anulada
  fecha_pago_completo timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financiacion_cuotas_importe_positivo check (importe_original > 0),
  constraint financiacion_cuotas_pagado_valido check (importe_pagado >= 0)
);
create unique index if not exists uq_financiacion_cuotas_plan_numero on financiacion_cuotas(plan_id, numero);
create index if not exists idx_financiacion_cuotas_negocio on financiacion_cuotas(negocio_id);
create index if not exists idx_financiacion_cuotas_plan on financiacion_cuotas(plan_id);
create index if not exists idx_financiacion_cuotas_vencimiento on financiacion_cuotas(negocio_id, fecha_vencimiento) where estado = 'pendiente';

-- Ahora que la tabla existe, agregamos la FK real de cta_cte_movimientos.cuota_id.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'cta_cte_movimientos_cuota_id_fkey' and table_name = 'cta_cte_movimientos'
  ) then
    alter table cta_cte_movimientos
      add constraint cta_cte_movimientos_cuota_id_fkey foreign key (cuota_id) references financiacion_cuotas(id) on delete set null;
  end if;
end $$;
create index if not exists idx_cta_cte_movimientos_cuota on cta_cte_movimientos(cuota_id) where cuota_id is not null;

-- ============================================================
-- Aplicación de PAGOS a cuotas (un pago —de la tabla pagos, existente— puede
-- cubrir una o varias cuotas; una cuota puede recibir pagos parciales de
-- varios pagos). Nunca se borra: es el rastro de "qué pago cubrió qué".
-- ============================================================
create table if not exists financiacion_pagos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cuota_id uuid not null references financiacion_cuotas(id) on delete cascade,
  pago_id uuid references pagos(id) on delete set null,           -- null = fue un ajuste, no un pago real (ver financiacion_ajustar_cuotas)
  monto_aplicado numeric not null,
  tipo text not null default 'pago',                               -- pago | ajuste
  motivo text,
  usuario text,
  created_at timestamptz not null default now(),
  constraint financiacion_pagos_monto_positivo check (monto_aplicado > 0)
);
create index if not exists idx_financiacion_pagos_negocio on financiacion_pagos(negocio_id);
create index if not exists idx_financiacion_pagos_cuota on financiacion_pagos(cuota_id);
-- Un mismo pago (de la tabla pagos) no puede aplicarse dos veces a la MISMA
-- cuota — evita el doble click / doble aplicación del mismo evento.
create unique index if not exists uq_financiacion_pagos_pago_cuota on financiacion_pagos(pago_id, cuota_id) where pago_id is not null;

-- ============================================================
-- RLS: aislamiento multitenant, mismo patrón que el resto de la app.
-- ============================================================
alter table financiacion_planes enable row level security;
alter table financiacion_cuotas enable row level security;
alter table financiacion_pagos enable row level security;

drop policy if exists "financiacion_planes de mi negocio" on financiacion_planes;
create policy "financiacion_planes de mi negocio" on financiacion_planes
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "financiacion_cuotas de mi negocio" on financiacion_cuotas;
create policy "financiacion_cuotas de mi negocio" on financiacion_cuotas
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

drop policy if exists "financiacion_pagos de mi negocio" on financiacion_pagos;
create policy "financiacion_pagos de mi negocio" on financiacion_pagos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ============================================================
-- Permiso: quién puede crear financiaciones / registrar pagos de cuotas.
-- Mismo patrón que el resto de los permisos granulares (puede_vender, etc.)
-- — columna en vendedores Y técnicos, default true (nadie queda bloqueado
-- por una columna que no existía antes).
-- ============================================================
alter table vendedores add column if not exists puede_gestionar_financiacion boolean not null default true;
alter table tecnicos add column if not exists puede_gestionar_financiacion boolean not null default true;

-- ============================================================
-- RPC: crear un plan de financiación completo (plan + cuotas + cargos en
-- cta_cte_movimientos), ATÓMICO. p_cuotas es un array de objetos ya
-- calculados por el motor de dominio (app/lib/financiacion/motor.ts) del
-- lado del backend — este RPC persiste, no recalcula montos (la única
-- autoridad de cálculo es la capa de dominio, no SQL ni el navegador).
-- ============================================================
create or replace function financiacion_crear_plan(
  p_cliente_id uuid,
  p_orden_id uuid,
  p_moneda text,
  p_importe_original numeric,
  p_entrega_inicial numeric,
  p_importe_financiado numeric,
  p_cuotas jsonb,          -- [{numero, fecha_vencimiento, importe}, ...]
  p_observaciones text,
  p_usuario text
) returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_plan uuid;
  v_cuota jsonb;
  v_cuota_id uuid;
  v_cantidad int;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_importe_financiado <= 0 then raise exception 'El importe financiado debe ser mayor a 0'; end if;
  v_cantidad := jsonb_array_length(p_cuotas);
  if v_cantidad < 1 then raise exception 'El plan necesita al menos 1 cuota'; end if;

  insert into financiacion_planes (
    negocio_id, cliente_id, orden_id, moneda, importe_original, entrega_inicial,
    importe_financiado, cantidad_cuotas, primera_cuota_fecha, observaciones, creado_por
  ) values (
    v_negocio, p_cliente_id, p_orden_id, p_moneda, p_importe_original, p_entrega_inicial,
    p_importe_financiado, v_cantidad, (p_cuotas->0->>'fecha_vencimiento')::date, p_observaciones, p_usuario
  ) returning id into v_plan;

  for v_cuota in select * from jsonb_array_elements(p_cuotas)
  loop
    insert into financiacion_cuotas (negocio_id, plan_id, numero, fecha_vencimiento, importe_original)
    values (v_negocio, v_plan, (v_cuota->>'numero')::int, (v_cuota->>'fecha_vencimiento')::date, (v_cuota->>'importe')::numeric)
    returning id into v_cuota_id;

    -- Un cargo en la cuenta corriente por CADA cuota, con SU vencimiento —
    -- así "vencido"/"al día"/estadoCuenta (que ya existen y no se tocan)
    -- ven la deuda desglosada, no un solo cargo grande como antes.
    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, orden_id, cuota_id, vencimiento, registrado_por_nombre)
    values (v_negocio, p_cliente_id, 'cargo', 'cuota', (v_cuota->>'importe')::numeric, p_moneda, p_orden_id, v_cuota_id, (v_cuota->>'fecha_vencimiento')::date, p_usuario);
  end loop;

  return v_plan;
end $$;

-- ============================================================
-- RPC: aplicar un pago (ya insertado en la tabla `pagos` por el flujo
-- existente de "Registrar pago") a una o varias cuotas. Idempotente por
-- pago_id+cuota_id (el índice único de arriba evita la doble aplicación
-- del mismo pago a la misma cuota si esto se reintenta). p_asignaciones ya
-- viene calculado por aplicarPagoACuotas() del motor — este RPC persiste,
-- no decide el reparto.
-- ============================================================
create or replace function financiacion_aplicar_pago(
  p_pago_id uuid,
  p_asignaciones jsonb,     -- [{cuota_id, monto}, ...]
  p_usuario text
) returns void language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_asig jsonb;
  v_cuota_id uuid;
  v_monto numeric;
  v_pagado numeric;
  v_original numeric;
  v_estado text;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  for v_asig in select * from jsonb_array_elements(p_asignaciones)
  loop
    v_cuota_id := (v_asig->>'cuota_id')::uuid;
    v_monto := (v_asig->>'monto')::numeric;
    if v_monto <= 0 then continue; end if;

    -- select ... for update: serializa aplicaciones simultáneas sobre la
    -- MISMA cuota (mismo patrón que repuesto_consumir en Servicio Técnico).
    select importe_original, importe_pagado into v_original, v_pagado
    from financiacion_cuotas where id = v_cuota_id and negocio_id = v_negocio for update;
    if not found then raise exception 'Cuota % no encontrada', v_cuota_id; end if;

    insert into financiacion_pagos (negocio_id, cuota_id, pago_id, monto_aplicado, tipo, usuario)
    values (v_negocio, v_cuota_id, p_pago_id, v_monto, 'pago', p_usuario)
    on conflict (pago_id, cuota_id) where pago_id is not null do nothing;
    -- Si el conflicto ya existía (reintento del mismo pago), no se vuelve a
    -- sumar — se saltea el resto de esta iteración para no aplicar dos veces.
    if not found then continue; end if;

    v_pagado := v_pagado + v_monto;
    v_estado := case when v_pagado >= v_original then 'pagada' else 'pendiente' end;
    update financiacion_cuotas
      set importe_pagado = v_pagado, estado = v_estado,
          fecha_pago_completo = case when v_estado = 'pagada' then now() else fecha_pago_completo end,
          updated_at = now()
    where id = v_cuota_id;

    perform financiacion_actualizar_estado_plan(v_cuota_id);
  end loop;
end $$;

-- Marca el plan como 'completado' cuando ya no le queda ninguna cuota
-- pendiente (todas pagadas o anuladas) — solo si sigue 'activo', nunca pisa
-- un plan ya anulado o reprogramado.
create or replace function financiacion_actualizar_estado_plan(p_cuota_id uuid)
returns void language plpgsql security definer as $$
declare
  v_plan_id uuid;
  v_quedan_pendientes int;
begin
  select plan_id into v_plan_id from financiacion_cuotas where id = p_cuota_id;
  if v_plan_id is null then return; end if;
  select count(*) into v_quedan_pendientes from financiacion_cuotas where plan_id = v_plan_id and estado = 'pendiente';
  if v_quedan_pendientes = 0 then
    update financiacion_planes set estado = 'completado', updated_at = now() where id = v_plan_id and estado = 'activo';
  end if;
end $$;

-- ============================================================
-- RPC: ajuste que reduce (o anula) deuda futura de un plan — SIN tocar
-- cuotas ya pagadas. Si no se especifican cuotas, aplica desde las ÚLTIMAS
-- impagas hacia atrás (spec: "por defecto, desde las últimas cuotas
-- impagas hacia atrás"). Registra en financiacion_pagos con tipo='ajuste'
-- (no es plata real, pero queda la misma trazabilidad de "qué cuota bajó").
-- ============================================================
create or replace function financiacion_ajustar_cuotas(
  p_plan_id uuid,
  p_monto numeric,
  p_motivo text,
  p_cuota_ids uuid[],       -- null/vacío = automático (últimas impagas hacia atrás)
  p_usuario text
) returns void language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_restante numeric := p_monto;
  v_cuota record;
  v_aplicar numeric;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_monto <= 0 then raise exception 'El monto del ajuste debe ser mayor a 0'; end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then raise exception 'El ajuste necesita un motivo'; end if;

  for v_cuota in
    select id, importe_original, importe_pagado
    from financiacion_cuotas
    where plan_id = p_plan_id and negocio_id = v_negocio and estado = 'pendiente'
      and (p_cuota_ids is null or array_length(p_cuota_ids, 1) is null or id = any(p_cuota_ids))
    order by (case when p_cuota_ids is null or array_length(p_cuota_ids, 1) is null then numero end) desc,
             numero asc
    for update
  loop
    if v_restante <= 0 then exit; end if;
    v_aplicar := least(v_restante, v_cuota.importe_original - v_cuota.importe_pagado);
    if v_aplicar <= 0 then continue; end if;

    insert into financiacion_pagos (negocio_id, cuota_id, pago_id, monto_aplicado, tipo, motivo, usuario)
    values (v_negocio, v_cuota.id, null, v_aplicar, 'ajuste', p_motivo, p_usuario);

    update financiacion_cuotas
      set importe_pagado = importe_pagado + v_aplicar,
          estado = case when importe_pagado + v_aplicar >= importe_original then 'pagada' else 'pendiente' end,
          fecha_pago_completo = case when importe_pagado + v_aplicar >= importe_original then now() else fecha_pago_completo end,
          updated_at = now()
    where id = v_cuota.id;

    -- Un abono en cta_cte_movimientos ligado a la cuota, para que el saldo
    -- general baje igual que con un pago real (es deuda que se condona).
    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, cuota_id, observacion, registrado_por_nombre)
    select v_negocio, cp.cliente_id, 'abono', 'nota_credito', v_aplicar, cp.moneda, v_cuota.id, p_motivo, p_usuario
    from financiacion_planes cp where cp.id = p_plan_id;

    perform financiacion_actualizar_estado_plan(v_cuota.id);
    v_restante := v_restante - v_aplicar;
  end loop;
end $$;

-- ============================================================
-- RPC: anular un plan completo — anula las cuotas NO pagadas (nunca las ya
-- pagadas) y sus cargos correspondientes en cta_cte_movimientos (soft-void,
-- mismo patrón que anularMovimiento en la ficha del cliente: anulado=true,
-- nunca se borra ni se reescribe el importe histórico).
-- ============================================================
create or replace function financiacion_anular_plan(
  p_plan_id uuid,
  p_motivo text,
  p_usuario text
) returns void language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then raise exception 'La anulación necesita un motivo'; end if;

  update cta_cte_movimientos
    set anulado = true
  where negocio_id = v_negocio and cuota_id in (
    select id from financiacion_cuotas where plan_id = p_plan_id and negocio_id = v_negocio and estado <> 'pagada'
  );

  update financiacion_cuotas
    set estado = 'anulada', updated_at = now()
  where plan_id = p_plan_id and negocio_id = v_negocio and estado <> 'pagada';

  update financiacion_planes
    set estado = 'anulado', observaciones = coalesce(observaciones || E'\n', '') || 'Anulado: ' || p_motivo, updated_at = now()
  where id = p_plan_id and negocio_id = v_negocio;
end $$;

-- ============================================================
-- RPC: reprogramar un plan — anula las cuotas pendientes del plan viejo Y
-- crea el plan nuevo con su cronograma, TODO en una sola transacción.
--
-- Antes esto se hacía desde el navegador con DOS llamadas separadas
-- (financiacion_anular_plan + financiacion_crear_plan): si la primera
-- terminaba bien pero la segunda fallaba (ej. un corte de red), la deuda
-- del plan viejo quedaba anulada sin que se llegara a crear el reemplazo —
-- la plata "desaparecía" del módulo de financiación sin dejar rastro de a
-- dónde fue. Con las dos partes adentro de esta única función, si cualquier
-- paso falla, Postgres deshace todo — nunca queda a mitad de camino.
-- p_cuotas ya viene calculado por el motor de dominio (mismo formato que
-- financiacion_crear_plan): [{numero, fecha_vencimiento, importe}, ...].
-- ============================================================
create or replace function financiacion_reprogramar(
  p_plan_anterior_id uuid,
  p_cliente_id uuid,
  p_orden_id uuid,
  p_moneda text,
  p_saldo_a_reprogramar numeric,
  p_cuotas jsonb,
  p_motivo text,
  p_usuario text
) returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_plan_nuevo uuid;
  v_cuota jsonb;
  v_cuota_id uuid;
  v_cantidad int;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then raise exception 'La reprogramación necesita un motivo'; end if;
  if p_saldo_a_reprogramar <= 0 then raise exception 'El saldo a reprogramar debe ser mayor a 0'; end if;
  v_cantidad := jsonb_array_length(p_cuotas);
  if v_cantidad < 1 then raise exception 'El nuevo plan necesita al menos 1 cuota'; end if;

  -- 1) Anular cuotas pendientes del plan viejo y sus cargos (las pagadas quedan intactas).
  update cta_cte_movimientos
    set anulado = true
  where negocio_id = v_negocio and cuota_id in (
    select id from financiacion_cuotas where plan_id = p_plan_anterior_id and negocio_id = v_negocio and estado <> 'pagada'
  );
  update financiacion_cuotas
    set estado = 'anulada', updated_at = now()
  where plan_id = p_plan_anterior_id and negocio_id = v_negocio and estado <> 'pagada';

  -- 2) Crear el plan nuevo con el saldo pendiente, enlazado al anterior.
  insert into financiacion_planes (
    negocio_id, cliente_id, orden_id, moneda, importe_original, entrega_inicial,
    importe_financiado, cantidad_cuotas, primera_cuota_fecha, observaciones, creado_por, plan_anterior_id
  ) values (
    v_negocio, p_cliente_id, p_orden_id, p_moneda, p_saldo_a_reprogramar, 0,
    p_saldo_a_reprogramar, v_cantidad, (p_cuotas->0->>'fecha_vencimiento')::date, p_motivo, p_usuario, p_plan_anterior_id
  ) returning id into v_plan_nuevo;

  for v_cuota in select * from jsonb_array_elements(p_cuotas)
  loop
    insert into financiacion_cuotas (negocio_id, plan_id, numero, fecha_vencimiento, importe_original)
    values (v_negocio, v_plan_nuevo, (v_cuota->>'numero')::int, (v_cuota->>'fecha_vencimiento')::date, (v_cuota->>'importe')::numeric)
    returning id into v_cuota_id;

    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, orden_id, cuota_id, vencimiento, registrado_por_nombre)
    values (v_negocio, p_cliente_id, 'cargo', 'cuota', (v_cuota->>'importe')::numeric, p_moneda, p_orden_id, v_cuota_id, (v_cuota->>'fecha_vencimiento')::date, p_usuario);
  end loop;

  -- 3) El plan viejo queda 'reprogramado' (no 'anulado' — se reemplazó, no se canceló sin más).
  update financiacion_planes
    set estado = 'reprogramado', observaciones = coalesce(observaciones || E'\n', '') || 'Reprogramado: ' || p_motivo, updated_at = now()
  where id = p_plan_anterior_id and negocio_id = v_negocio;

  return v_plan_nuevo;
end $$;

grant execute on function financiacion_crear_plan(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, text) to authenticated;
grant execute on function financiacion_aplicar_pago(uuid, jsonb, text) to authenticated;
grant execute on function financiacion_ajustar_cuotas(uuid, numeric, text, uuid[], text) to authenticated;
grant execute on function financiacion_anular_plan(uuid, text, text) to authenticated;
grant execute on function financiacion_reprogramar(uuid, uuid, uuid, text, numeric, jsonb, text, text) to authenticated;
