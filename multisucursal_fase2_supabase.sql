-- ============================================================
-- Multisucursal — Fase 2. Cambios de base de datos de esta fase: dos RPC de
-- financiación (financiacion_propia_supabase.sql) insertan cargos en
-- cta_cte_movimientos por fuera de cualquier .insert() del cliente, así que
-- el filtrado por sucursal no les llega solo con cambios en app/. A ambas
-- se les agrega un parámetro p_sucursal_id opcional (default null, así que
-- un negocio que no activó multisucursal no nota ningún cambio):
-- financiacion_crear_plan (plan nuevo) y financiacion_reprogramar (plan
-- reprogramado — genera SU PROPIO cargo por cuota, no llama a
-- financiacion_crear_plan). financiacion_aplicar_pago y
-- financiacion_ajustar_cuotas NO se tocan: no insertan en
-- cta_cte_movimientos, solo actualizan cuotas existentes.
--
-- Se dropea cada función vieja antes de recrearla: agregar un parámetro con
-- "create or replace" sin dropear antes deja DOS versiones superpuestas y
-- Postgres tira error de "función no es única" apenas alguien la llama con
-- los argumentos de siempre. Segura de re-correr (idempotente).
-- ============================================================

drop function if exists financiacion_crear_plan(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, text);

create or replace function financiacion_crear_plan(
  p_cliente_id uuid,
  p_orden_id uuid,
  p_moneda text,
  p_importe_original numeric,
  p_entrega_inicial numeric,
  p_importe_financiado numeric,
  p_cuotas jsonb,          -- [{numero, fecha_vencimiento, importe}, ...]
  p_observaciones text,
  p_usuario text,
  p_sucursal_id uuid default null
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

    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, orden_id, cuota_id, vencimiento, registrado_por_nombre, sucursal_id)
    values (v_negocio, p_cliente_id, 'cargo', 'cuota', (v_cuota->>'importe')::numeric, p_moneda, p_orden_id, v_cuota_id, (v_cuota->>'fecha_vencimiento')::date, p_usuario, p_sucursal_id);
  end loop;

  return v_plan;
end $$;

grant execute on function financiacion_crear_plan(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, text, uuid) to authenticated;

drop function if exists financiacion_reprogramar(uuid, uuid, uuid, text, numeric, jsonb, text, text);

create or replace function financiacion_reprogramar(
  p_plan_anterior_id uuid,
  p_cliente_id uuid,
  p_orden_id uuid,
  p_moneda text,
  p_saldo_a_reprogramar numeric,
  p_cuotas jsonb,
  p_motivo text,
  p_usuario text,
  p_sucursal_id uuid default null
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

  update cta_cte_movimientos
    set anulado = true
  where negocio_id = v_negocio and cuota_id in (
    select id from financiacion_cuotas where plan_id = p_plan_anterior_id and negocio_id = v_negocio and estado <> 'pagada'
  );
  update financiacion_cuotas
    set estado = 'anulada', updated_at = now()
  where plan_id = p_plan_anterior_id and negocio_id = v_negocio and estado <> 'pagada';

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

    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, orden_id, cuota_id, vencimiento, registrado_por_nombre, sucursal_id)
    values (v_negocio, p_cliente_id, 'cargo', 'cuota', (v_cuota->>'importe')::numeric, p_moneda, p_orden_id, v_cuota_id, (v_cuota->>'fecha_vencimiento')::date, p_usuario, p_sucursal_id);
  end loop;

  update financiacion_planes
    set estado = 'reprogramado', observaciones = coalesce(observaciones || E'\n', '') || 'Reprogramado: ' || p_motivo, updated_at = now()
  where id = p_plan_anterior_id and negocio_id = v_negocio;

  return v_plan_nuevo;
end $$;

grant execute on function financiacion_reprogramar(uuid, uuid, uuid, text, numeric, jsonb, text, text, uuid) to authenticated;
