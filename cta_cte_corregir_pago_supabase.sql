-- ============================================================
-- Corregir el monto de un "Pago recibido" de la cuenta corriente de un cliente (2026-10-23)
-- Pedido de un cliente: si al registrar un pago se tipea mal el número, hoy no hay forma de editarlo (solo anular y volver a cargar).
--
-- Cambia, en UNA sola transacción, el monto en todos los lugares donde figura el pago: el pago (Caja), el movimiento de la cuenta
-- corriente (saldo del cliente), la orden/boleta del cobro y el ítem de esa boleta; y, si el pago era un equipo recibido como parte
-- de pago, el valor reconocido del equipo en Plan Canje.
-- NO toca cuotas de financiación: si el pago estaba aplicado a cuotas, la app primero lo revierte con financiacion_revertir_pago y
-- después lo vuelve a aplicar con el monto nuevo; esta función se niega a correr mientras queden cuotas aplicadas, para que nunca
-- queden cuotas y pago con montos distintos.
-- Migración ADITIVA e IDEMPOTENTE (create or replace).
-- ============================================================
create or replace function cta_cte_corregir_monto_pago(p_movimiento_id uuid, p_nuevo_monto numeric, p_usuario text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_negocio uuid := negocio_actual();
  v_mov record;
begin
  if v_negocio is null then
    raise exception 'Sin negocio';
  end if;
  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a 0';
  end if;

  select * into v_mov from cta_cte_movimientos where id = p_movimiento_id and negocio_id = v_negocio for update;
  if not found then
    raise exception 'Movimiento no encontrado';
  end if;
  if v_mov.anulado then
    raise exception 'Este movimiento ya está anulado';
  end if;
  if v_mov.tipo <> 'abono' or v_mov.concepto <> 'pago' or v_mov.pago_id is null then
    raise exception 'Solo se puede corregir un pago recibido';
  end if;
  if exists (select 1 from financiacion_pagos where pago_id = v_mov.pago_id and negocio_id = v_negocio and tipo = 'pago') then
    raise exception 'Este pago está aplicado a cuotas de financiación: hay que revertirlo antes de corregir el monto';
  end if;

  update pagos set monto = p_nuevo_monto where id = v_mov.pago_id and negocio_id = v_negocio;
  -- Queda constancia visible en el extracto de que el monto se corrigió (y de cuánto era antes).
  update cta_cte_movimientos
    set monto = p_nuevo_monto,
        observacion = case when coalesce(observacion, '') = '' then '' else observacion || ' · ' end
          || 'Monto corregido de ' || v_mov.monto::text || ' a ' || p_nuevo_monto::text
          || case when coalesce(p_usuario, '') = '' then '' else ' por ' || p_usuario end
    where id = v_mov.id;

  -- La orden que generó este cobro (solo las de "Cobro de financiamiento / cuenta corriente": nunca una venta).
  if v_mov.orden_id is not null then
    update ordenes set total = p_nuevo_monto
      where id = v_mov.orden_id and negocio_id = v_negocio and nota = 'Cobro de financiamiento / cuenta corriente.';
    if found then
      update orden_items set precio_unitario = p_nuevo_monto where orden_id = v_mov.orden_id and tipo = 'financiamiento';
      update canjes set monto = p_nuevo_monto where orden_id = v_mov.orden_id and negocio_id = v_negocio;
    end if;
  end if;

  return jsonb_build_object('anterior', v_mov.monto, 'nuevo', p_nuevo_monto);
end $$;
