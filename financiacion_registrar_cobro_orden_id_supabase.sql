-- ============================================================
-- Cuenta cte./Financiaciones: vincular cada movimiento de pago con su orden
-- (2026-09-18) — pedido real: desde la ficha del cliente, al ver un
-- movimiento de "Pago recibido" o una cuota de financiación, no había forma
-- de entrar a ver la orden/producto que lo originó.
--
-- financiacion_registrar_cobro ya creaba la orden del cobro (v_orden_id) y
-- el pago, pero al insertar el movimiento en cta_cte_movimientos no le
-- guardaba el orden_id (solo el pago_id) — la columna orden_id existe desde
-- cuenta_corriente_supabase.sql pero quedaba sin usar en este caso puntual.
-- Con esto, cada pago nuevo queda directamente vinculado a su orden.
-- ============================================================

create or replace function financiacion_registrar_cobro(
  p_cliente_id uuid,
  p_monto numeric,
  p_medio text,
  p_moneda text,
  p_sucursal_id uuid,
  p_observacion text,
  p_orden_original_id uuid,
  p_usuario text
) returns jsonb language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_orden_id uuid;
  v_pago_id uuid;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  insert into ordenes (negocio_id, cliente_id, estado, total, moneda, nota, orden_original_id, sucursal_id)
  values (v_negocio, p_cliente_id, 'pagado', p_monto, p_moneda, 'Cobro de financiamiento / cuenta corriente.', p_orden_original_id, p_sucursal_id)
  returning id into v_orden_id;

  insert into orden_items (orden_id, descripcion, cantidad, precio_unitario, tipo)
  values (v_orden_id, 'Cobro de financiamiento / cuenta corriente', 1, p_monto, 'financiamiento');

  insert into pagos (negocio_id, cliente_id, orden_id, medio, monto, moneda, caja_tipo, observacion, registrado_por_nombre, sucursal_id)
  values (v_negocio, p_cliente_id, v_orden_id, p_medio, p_monto, p_moneda, 'financiamiento', p_observacion, p_usuario, p_sucursal_id)
  returning id into v_pago_id;

  insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, pago_id, orden_id, observacion, registrado_por_nombre, sucursal_id)
  values (v_negocio, p_cliente_id, 'abono', 'pago', p_monto, p_moneda, v_pago_id, v_orden_id, p_observacion, p_usuario, p_sucursal_id);

  return jsonb_build_object('orden_id', v_orden_id, 'pago_id', v_pago_id);
end $$;

-- Backfill: movimientos de pago viejos que ya tienen pago_id pero no
-- orden_id, se completan con la orden de su propio pago (no rompe nada,
-- solo agrega el link donde faltaba).
update cta_cte_movimientos m
set orden_id = p.orden_id
from pagos p
where m.pago_id = p.id
  and m.orden_id is null
  and p.orden_id is not null;
