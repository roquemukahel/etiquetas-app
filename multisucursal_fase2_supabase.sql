-- ============================================================
-- Multisucursal — Fase 2. Único cambio de base de datos de esta fase: el
-- RPC financiacion_crear_plan (financiacion_propia_supabase.sql) inserta
-- cargos en cta_cte_movimientos por fuera de cualquier .insert() del
-- cliente, así que el filtrado por sucursal no le llega solo con cambios en
-- app/. Se le agrega un parámetro p_sucursal_id opcional (default null, así
-- que un negocio que no activó multisucursal no nota ningún cambio).
--
-- Se dropea la función vieja antes de recrearla: agregar un parámetro con
-- "create or replace" sin dropear antes deja DOS versiones superpuestas
-- (la de 9 argumentos y esta de 10) y Postgres tira error de "función no es
-- única" apenas alguien la llama con los 9 de siempre. Segura de re-correr
-- (idempotente).
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
