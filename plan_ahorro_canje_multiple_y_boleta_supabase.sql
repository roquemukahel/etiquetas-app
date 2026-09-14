-- ============================================================
-- Plan de ahorro: varios dispositivos por abono de Plan canje +
-- que la boleta final muestre "pagado" y los canjes entregados
-- (2026-09-13) — roque probó el flujo (funcionó: generó la orden
-- #F-000084 con "Método de pago: Plan de ahorro") y pidió 3 ajustes:
--
-- 1) Que se puedan cargar VARIOS dispositivos en un mismo abono de
--    Plan canje (hasta ahora solo uno).
-- 2) Que la boleta diga "Plan de ahorro (pagado)" — para que quede
--    claro de un vistazo que no es un saldo pendiente, sino un plan ya
--    saldado.
-- 3) Que los equipos entregados por Plan canje durante el plan
--    aparezcan en esa misma boleta, como ya pasa en cualquier venta
--    con canje (la boleta ya sabe mostrar "Plan canje — dispositivo
--    entregado" para cualquier fila de `canjes` con su mismo orden_id;
--    solo falta vincular esas filas cuando el plan se completa).
--
-- El historial de cuotas (fecha/medio/monto de cada abono) no necesita
-- ninguna columna nueva — ya vive en plan_ahorro_movimientos y la
-- boleta lo puede consultar directo a partir de planes_ahorro.orden_id
-- (agregado en la migración anterior).
--
-- Para (1) y (3), cambia el sentido del link entre pago y canje: en
-- vez de que el movimiento apunte a UN canje (canje_id, agregado ayer,
-- sin datos reales todavía), ahora cada canje apunta al movimiento que
-- lo generó (plan_ahorro_movimiento_id) — así un mismo abono puede
-- traer más de un equipo.
-- ============================================================

alter table plan_ahorro_movimientos drop column if exists canje_id;

alter table canjes add column if not exists plan_ahorro_movimiento_id uuid references plan_ahorro_movimientos(id) on delete set null;

create or replace function plan_ahorro_completar(p_plan_id uuid, p_sucursal_id uuid default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_negocio uuid := negocio_actual();
  v_plan record;
  v_disp record;
  v_descripcion text;
  v_tipo text;
  v_orden_id uuid;
begin
  if v_negocio is null then
    raise exception 'Sin negocio';
  end if;

  select id, cliente_id, dispositivo_id, monto_objetivo, modelo, capacidad_gb, color, detalles, estado
    into v_plan
    from planes_ahorro
    where id = p_plan_id and negocio_id = v_negocio;
  if v_plan.id is null then
    raise exception 'Plan no encontrado';
  end if;
  if v_plan.estado <> 'activo' then
    raise exception 'Este plan ya no está activo';
  end if;

  if v_plan.dispositivo_id is not null then
    -- Seña: el equipo reservado sale de stock atómicamente — si dos
    -- confirmaciones llegan casi juntas, solo la primera pasa en_stock de
    -- true a false (mismo patrón ya usado en Compras/Canje); la segunda
    -- aborta en vez de generar una segunda venta del mismo equipo.
    update dispositivos set en_stock = false
      where id = v_plan.dispositivo_id and en_stock = true and negocio_id = v_negocio
      returning modelo, capacidad_gb, color, imei into v_disp;
    if not found then
      raise exception 'Este equipo ya no figura en Stock (puede que ya se haya vendido o dado de baja).';
    end if;
    v_descripcion := coalesce(v_disp.modelo, 'Equipo')
      || case when v_disp.capacidad_gb is not null then ' ' || v_disp.capacidad_gb::text || 'GB' else '' end
      || case when v_disp.color is not null then ' ' || v_disp.color else '' end
      || case when v_disp.imei is not null then ' · IMEI ' || v_disp.imei else '' end;
    v_tipo := 'dispositivo';
  else
    v_descripcion := trim(
      coalesce(v_plan.modelo, '')
      || case when v_plan.capacidad_gb is not null then ' ' || v_plan.capacidad_gb::text || 'GB' else '' end
      || case when v_plan.color is not null then ' ' || v_plan.color else '' end
    );
    if v_descripcion = '' then
      v_descripcion := coalesce(v_plan.detalles, 'Plan de ahorro');
    end if;
    v_tipo := 'plan_ahorro';
  end if;

  insert into ordenes (negocio_id, cliente_id, dispositivo_id, total, estado, forma_pago, sucursal_id)
  values (
    v_negocio, v_plan.cliente_id, v_plan.dispositivo_id, v_plan.monto_objetivo, 'pagado',
    case when v_plan.dispositivo_id is not null then 'Plan de ahorro / seña (pagado)' else 'Plan de ahorro (pagado)' end,
    p_sucursal_id
  )
  returning id into v_orden_id;

  insert into orden_items (orden_id, dispositivo_id, descripcion, cantidad, precio_unitario, tipo)
  values (v_orden_id, v_plan.dispositivo_id, v_descripcion, 1, v_plan.monto_objetivo, v_tipo);

  -- Los equipos que el cliente fue entregando por Plan canje durante el
  -- plan quedan vinculados a la venta final, para que la boleta los
  -- muestre igual que en cualquier venta con canje.
  update canjes set orden_id = v_orden_id
    where negocio_id = v_negocio
      and plan_ahorro_movimiento_id in (
        select id from plan_ahorro_movimientos where plan_id = v_plan.id and not anulado
      );

  update planes_ahorro set estado = 'completado', orden_id = v_orden_id where id = v_plan.id;

  return jsonb_build_object('orden_id', v_orden_id);
end;
$$;

grant execute on function plan_ahorro_completar(uuid, uuid) to authenticated;
