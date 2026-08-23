-- ============================================================
-- AUDITORÍA EXHAUSTIVA (2026-08-22) — hallazgo P1: anular un pago que ya
-- se había aplicado a una o más cuotas de financiación (vía
-- financiacion_aplicar_pago) NO revertía nada en financiacion_cuotas. El
-- saldo de cuenta corriente del cliente volvía a subir (correcto), pero la
-- cuota seguía figurando "pagada" — dos pantallas del mismo negocio
-- (Cuenta corriente vs. Financiación/Cuentas por cobrar) mostrando
-- información contradictoria sobre si esa cuota está saldada.
--
-- Esta función deshace exactamente lo que financiacion_aplicar_pago había
-- aplicado para un pago puntual: por cada financiacion_pagos ligado a
-- p_pago_id, resta monto_aplicado de la cuota correspondiente, recalcula
-- su estado, y si eso hace que un plan ya "completado" vuelva a tener una
-- cuota pendiente, el plan vuelve a "activo" (financiacion_actualizar_
-- estado_plan solo sabe completar un plan, nunca reabrirlo — sin este
-- paso el plan quedaría "completado" con una cuota pendiente real).
--
-- Se llama desde app/clientes/[id]/page.tsx (anularMovimiento), además de
-- lo que ya hacía (anular cta_cte_movimientos y pagos). Idempotente: si
-- ya no quedan filas de financiacion_pagos para ese pago (porque ya se
-- revirtió antes, o porque nunca se aplicó a ninguna cuota), no hace nada
-- y devuelve 0. Segura de re-correr.
-- ============================================================

create or replace function financiacion_revertir_pago(p_pago_id uuid, p_usuario text)
returns int language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_aplicacion record;
  v_cuota record;
  v_nuevo_pagado numeric;
  v_nuevo_estado text;
  v_count int := 0;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  for v_aplicacion in
    select fp.id, fp.cuota_id, fp.monto_aplicado
    from financiacion_pagos fp
    where fp.pago_id = p_pago_id and fp.negocio_id = v_negocio and fp.tipo = 'pago'
  loop
    select * into v_cuota from financiacion_cuotas where id = v_aplicacion.cuota_id and negocio_id = v_negocio for update;
    if not found then continue; end if;

    v_nuevo_pagado := greatest(0, v_cuota.importe_pagado - v_aplicacion.monto_aplicado);
    v_nuevo_estado := case
      when v_cuota.estado = 'anulada' then 'anulada'
      when v_nuevo_pagado >= v_cuota.importe_original then 'pagada'
      else 'pendiente'
    end;

    update financiacion_cuotas
      set importe_pagado = v_nuevo_pagado,
          estado = v_nuevo_estado,
          fecha_pago_completo = case when v_nuevo_estado = 'pagada' then fecha_pago_completo else null end,
          updated_at = now()
      where id = v_aplicacion.cuota_id;

    delete from financiacion_pagos where id = v_aplicacion.id;

    -- Si la cuota vuelve a quedar pendiente y su plan ya estaba
    -- "completado", el plan tiene que volver a "activo" — lo contrario de
    -- financiacion_actualizar_estado_plan (esa solo completa, nunca reabre).
    if v_nuevo_estado = 'pendiente' then
      update financiacion_planes set estado = 'activo', updated_at = now()
        where id = v_cuota.plan_id and estado = 'completado';
    end if;

    perform financiacion_actualizar_estado_plan(v_aplicacion.cuota_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function financiacion_revertir_pago(uuid, text) to authenticated;
