-- ============================================================
-- Multisucursal — Fase 2, parche. financiacion_ajustar_cuotas (descuento o
-- condonación aplicado a las cuotas de un plan de financiación) SÍ inserta
-- en cta_cte_movimientos (un abono por cada cuota ajustada) — el comentario
-- original de multisucursal_fase2_supabase.sql decía que no lo hacía, y por
-- eso quedó afuera de esa migración. Se le agrega el mismo p_sucursal_id
-- opcional (default null, así que un negocio que no activó multisucursal no
-- nota ningún cambio) que ya tienen financiacion_crear_plan y
-- financiacion_reprogramar.
--
-- Sin este fix, un ajuste/descuento sobre un plan de financiación queda con
-- sucursal_id null en la cuenta corriente — invisible en cualquier vista
-- filtrada por sucursal, igual que le pasaba a Servicio Técnico.
--
-- Se dropea la función vieja antes de recrearla (mismo motivo que la
-- migración original: agregar un parámetro con "create or replace" sin
-- dropear antes deja dos versiones superpuestas). Segura de re-correr
-- (idempotente).
-- ============================================================

drop function if exists financiacion_ajustar_cuotas(uuid, numeric, text, uuid[], text);

create or replace function financiacion_ajustar_cuotas(
  p_plan_id uuid,
  p_monto numeric,
  p_motivo text,
  p_cuota_ids uuid[],       -- null/vacío = automático (últimas impagas hacia atrás)
  p_usuario text,
  p_sucursal_id uuid default null
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
    insert into cta_cte_movimientos (negocio_id, cliente_id, tipo, concepto, monto, moneda, cuota_id, observacion, registrado_por_nombre, sucursal_id)
    select v_negocio, cp.cliente_id, 'abono', 'nota_credito', v_aplicar, cp.moneda, v_cuota.id, p_motivo, p_usuario, p_sucursal_id
    from financiacion_planes cp where cp.id = p_plan_id;

    perform financiacion_actualizar_estado_plan(v_cuota.id);
    v_restante := v_restante - v_aplicar;
  end loop;
end $$;

grant execute on function financiacion_ajustar_cuotas(uuid, numeric, text, uuid[], text, uuid) to authenticated;
