-- ============================================================
-- Financiamiento: "Forma de pago" vacía en la orden generada por un cobro
-- (2026-09-29) — reclamo real de un cliente: la ficha de una orden de
-- cobro de financiamiento/cuenta corriente (ej. F-000710) mostraba
-- "Forma de pago:" en blanco, mientras que su propia boleta SÍ mostraba
-- "Transferencia" correctamente (la boleta arma el dato desde `pagos`, no
-- desde `ordenes.forma_pago`).
--
-- Causa: financiacion_registrar_cobro (financiacion_registrar_cobro_supabase.sql)
-- inserta la orden del cobro sin incluir la columna forma_pago en el
-- insert, así que queda NULL siempre — pese a que el medio de pago SÍ se
-- recibe (p_medio) y SÍ se guarda correctamente en `pagos.medio`.
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

  insert into ordenes (negocio_id, cliente_id, estado, total, moneda, forma_pago, nota, orden_original_id, sucursal_id)
  values (v_negocio, p_cliente_id, 'pagado', p_monto, p_moneda, p_medio, 'Cobro de financiamiento / cuenta corriente.', p_orden_original_id, p_sucursal_id)
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

-- Backfill: órdenes de cobro ya generadas por ESTA función (identificables
-- por su nota fija) que quedaron con forma_pago NULL se completan con el
-- medio real de su propio `pagos.medio` (mismo criterio que ya usa la
-- boleta para mostrarlo). Restringido a esa nota puntual — y no a
-- "cualquier orden con forma_pago null" — para no tocar otros tipos de
-- orden (ej. canjes) donde forma_pago null pueda ser legítimo por otra
-- razón.
update ordenes o
set forma_pago = p.medio
from pagos p
where p.orden_id = o.id
  and o.nota = 'Cobro de financiamiento / cuenta corriente.'
  and o.forma_pago is null
  and p.medio is not null;
