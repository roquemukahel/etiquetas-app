-- ============================================================
-- Plan de ahorro: pagar con un dispositivo (Plan canje) + que al
-- completarse SIEMPRE se genere una venta de verdad
-- (2026-09-13) — pedido de roque:
--
-- 1) Hoy, al registrar un abono, las únicas formas de pago son
--    efectivo/transferencia/débito/crédito/USDT. Un cliente que entrega
--    un equipo usado como parte de pago del plan no tiene forma de
--    cargarlo — hay que poder sumarlo como "Plan canje" igual que ya se
--    puede en Nueva Orden, y que el equipo entre a la cola de Plan Canje
--    (tabla `canjes`) para revisarlo después.
--
-- 2) Al completar un plan de ahorro SIN un dispositivo puntual reservado
--    ("seña"), hoy no pasa nada más que cambiar el estado a "completado"
--    — no se genera ninguna orden/boleta. Un plan CON seña sí generaba la
--    venta, pero a mano desde el navegador (varios inserts sueltos, sin
--    transacción, sin fila en `pagos`) y sin dejar ningún rastro en el
--    plan de cuál fue la orden generada — si alguien vuelve después a esa
--    pantalla, no hay forma de encontrar la boleta desde ahí.
--
-- Esta migración agrega la columna para el link entre pago y canje, la
-- columna para el link entre plan y la orden que genera al completarse, y
-- una función que reemplaza la lógica de "entregar equipo" de ambos casos
-- (con seña y sin seña) por una sola transacción atómica.
-- ============================================================

alter table plan_ahorro_movimientos add column if not exists canje_id uuid references canjes(id) on delete set null;

alter table planes_ahorro add column if not exists orden_id uuid references ordenes(id) on delete set null;

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
    case when v_plan.dispositivo_id is not null then 'Plan de ahorro / seña' else 'Plan de ahorro' end,
    p_sucursal_id
  )
  returning id into v_orden_id;

  insert into orden_items (orden_id, dispositivo_id, descripcion, cantidad, precio_unitario, tipo)
  values (v_orden_id, v_plan.dispositivo_id, v_descripcion, 1, v_plan.monto_objetivo, v_tipo);

  update planes_ahorro set estado = 'completado', orden_id = v_orden_id where id = v_plan.id;

  return jsonb_build_object('orden_id', v_orden_id);
end;
$$;

grant execute on function plan_ahorro_completar(uuid, uuid) to authenticated;
