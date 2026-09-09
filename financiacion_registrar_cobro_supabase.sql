-- ============================================================
-- FINANCIAMIENTO: RPC atómico para "registrar un cobro" (2026-09-09) —
-- corrige un bug real encontrado en la revisión de esta misma sesión.
--
-- registrarCobroFinanciamiento (app/lib/financiacion/servicio.ts) hacía 4
-- inserts secuenciales desde el navegador (ordenes → orden_items → pagos →
-- cta_cte_movimientos) sin ninguna transacción. Si alguno fallaba a mitad
-- de camino (ej. un corte de red justo después de cobrar), podía quedar:
--   - una orden "pagada" sin ningún ítem (boleta vacía), o
--   - el pago YA cobrado (plata real, caja lo cuenta) pero sin el abono en
--     cta_cte_movimientos, así que el saldo del cliente NO bajaba pese a
--     haber pagado — quedaba debiendo lo mismo, o se le podía volver a
--     cobrar por error.
-- También tenía un typo real: la orden se creaba con estado 'pagada' en
-- vez de 'pagado' (el único valor que el resto del sistema reconoce —
-- Estadísticas, comisiones, el color del estado en Órdenes), así que ESTOS
-- COBROS YA HECHOS no contaban como ventas cobradas en ningún lado.
--
-- Este RPC junta las 4 escrituras en una sola transacción (mismo patrón que
-- financiacion_crear_plan/financiacion_reprogramar en
-- financiacion_propia_supabase.sql): si algo falla, Postgres deshace todo,
-- nunca queda a mitad de camino. La aplicación a cuotas puntuales sigue
-- siendo un paso aparte (financiacion_aplicar_pago, ya atómico en sí mismo)
-- porque decidir A QUÉ CUOTA se aplica el pago es lógica de dominio que
-- vive en TypeScript (app/lib/financiacion/motor.ts), no en SQL.
--
-- UPDATE de datos: si ya se generaron cobros con estado 'pagada' antes de
-- esta migración, corregilos a mano con:
--   update ordenes set estado = 'pagado'
--   where estado = 'pagada' and id in (select orden_id from pagos where caja_tipo = 'financiamiento');
-- ============================================================

-- Limpieza chica encontrada en la misma revisión: caja_vuelto_separado_supabase.sql
-- agregó un 5to parámetro (p_efectivo_vuelto) a caja_cerrar_turno con "create
-- or replace" — Postgres identifica una función por nombre + firma de
-- parámetros, así que un cambio de ARIDAD no reemplaza la versión vieja de 4
-- parámetros (de caja_auto_apertura_supabase.sql), la deja viva como una
-- segunda función. Hoy no rompe nada (el único llamador siempre pasa los 5
-- argumentos con nombre), pero una llamada directa con los 4 argumentos
-- viejos resolvería en silencio a esa función vieja (sin el cálculo de
-- vuelto/retiro automático) en vez de fallar. Se borra para que solo quede
-- una versión posible.
drop function if exists caja_cerrar_turno(uuid, numeric, text, text);

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

  insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, pago_id, observacion, registrado_por_nombre, sucursal_id)
  values (v_negocio, p_cliente_id, 'abono', 'pago', p_monto, p_moneda, v_pago_id, p_observacion, p_usuario, p_sucursal_id);

  return jsonb_build_object('orden_id', v_orden_id, 'pago_id', v_pago_id);
end $$;

grant execute on function financiacion_registrar_cobro(uuid, numeric, text, text, uuid, text, uuid, text) to authenticated;
