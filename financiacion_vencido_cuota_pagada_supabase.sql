-- ============================================================
-- Financiamiento: cuota pagada que sigue contando como "vencida" para
-- siempre (2026-09-29) — reclamo real de un cliente. Ejemplo: Mercedes
-- Celiz pagó su cuota 1 el 23/9, la pestaña "Financiaciones" (que lee
-- financiacion_cuotas) correctamente dice "0 cuotas vencidas", pero su
-- ficha (que calcula mora agregando cta_cte_movimientos) sigue diciendo
-- "En mora · vencido hace 6 días".
--
-- Causa raíz: financiacion_crear_plan inserta UN CARGO por cuota en
-- cta_cte_movimientos con su propio vencimiento (para que saldos/vencido
-- vean la deuda desglosada). Pero financiacion_aplicar_pago — que es lo
-- que efectivamente marca una cuota como 'pagada' en financiacion_cuotas —
-- NUNCA toca ese cargo original: el abono del cobro se registra aparte
-- (financiacion_registrar_cobro), genérico, sin apuntar a ese cargo
-- puntual. Entonces ese cargo con vencimiento < hoy queda en la cuenta
-- corriente PARA SIEMPRE, y cualquier cálculo de "vencido"/"en mora" que
-- sume cargos vencidos (la ficha del cliente, y saldos_cuenta_corriente()
-- abajo) lo sigue contando aunque la cuota específica ya esté saldada —
-- siempre que el cliente tenga OTRA deuda pendiente (ej. cuotas futuras)
-- que mantenga su saldo total en positivo.
--
-- Fix: cuando una cuota queda 'pagada', se limpia el vencimiento de su
-- cargo original en cta_cte_movimientos (el monto queda igual — sigue
-- contando correctamente para el saldo total, ya compensado por el abono
-- — solo deja de contar como "vencido" porque vencimiento pasa a null).
-- ============================================================

create or replace function financiacion_aplicar_pago(
  p_pago_id uuid,
  p_asignaciones jsonb,     -- [{cuota_id, monto}, ...]
  p_usuario text
) returns void language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_asig jsonb;
  v_cuota_id uuid;
  v_monto numeric;
  v_pagado numeric;
  v_original numeric;
  v_estado text;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  for v_asig in select * from jsonb_array_elements(p_asignaciones)
  loop
    v_cuota_id := (v_asig->>'cuota_id')::uuid;
    v_monto := (v_asig->>'monto')::numeric;
    if v_monto <= 0 then continue; end if;

    -- select ... for update: serializa aplicaciones simultáneas sobre la
    -- MISMA cuota (mismo patrón que repuesto_consumir en Servicio Técnico).
    select importe_original, importe_pagado into v_original, v_pagado
    from financiacion_cuotas where id = v_cuota_id and negocio_id = v_negocio for update;
    if not found then raise exception 'Cuota % no encontrada', v_cuota_id; end if;

    insert into financiacion_pagos (negocio_id, cuota_id, pago_id, monto_aplicado, tipo, usuario)
    values (v_negocio, v_cuota_id, p_pago_id, v_monto, 'pago', p_usuario)
    on conflict (pago_id, cuota_id) where pago_id is not null do nothing;
    -- Si el conflicto ya existía (reintento del mismo pago), no se vuelve a
    -- sumar — se saltea el resto de esta iteración para no aplicar dos veces.
    if not found then continue; end if;

    v_pagado := v_pagado + v_monto;
    v_estado := case when v_pagado >= v_original then 'pagada' else 'pendiente' end;
    update financiacion_cuotas
      set importe_pagado = v_pagado, estado = v_estado,
          fecha_pago_completo = case when v_estado = 'pagada' then now() else fecha_pago_completo end,
          updated_at = now()
    where id = v_cuota_id;

    if v_estado = 'pagada' then
      update cta_cte_movimientos
        set vencimiento = null
      where cuota_id = v_cuota_id and tipo = 'cargo' and not anulado and vencimiento is not null;
    end if;

    perform financiacion_actualizar_estado_plan(v_cuota_id);
  end loop;
end $$;

-- Contraparte: si un pago se anula (financiacion_revertir_pago) y la cuota
-- vuelve a 'pendiente', hay que RESTAURAR el vencimiento del cargo original
-- que el fix de arriba le había limpiado — si no, esa cuota podría volver a
-- estar vencida en la realidad pero su cargo ya no lo mostraría nunca más
-- como tal.
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
    -- También se restaura el vencimiento del cargo (ver comentario arriba).
    if v_nuevo_estado = 'pendiente' then
      update financiacion_planes set estado = 'activo', updated_at = now()
        where id = v_cuota.plan_id and estado = 'completado';

      update cta_cte_movimientos
        set vencimiento = v_cuota.fecha_vencimiento
      where cuota_id = v_aplicacion.cuota_id and tipo = 'cargo' and not anulado and vencimiento is null;
    end if;

    perform financiacion_actualizar_estado_plan(v_aplicacion.cuota_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function financiacion_revertir_pago(uuid, text) to authenticated;

-- Backfill: cuotas que YA están 'pagada' hoy, pero cuyo cargo original en
-- cta_cte_movimientos todavía tiene vencimiento seteado (porque quedó así
-- de antes de este fix) — se limpian del mismo modo.
update cta_cte_movimientos m
set vencimiento = null
from financiacion_cuotas c
where m.cuota_id = c.id
  and c.estado = 'pagada'
  and m.tipo = 'cargo'
  and not m.anulado
  and m.vencimiento is not null;

-- Defensa adicional en saldos_cuenta_corriente(): "vencido" nunca puede
-- superar la deuda total actual (saldo) — mismo tope que ya aplica
-- app/clientes/[id]/page.tsx del lado del cliente
-- (Math.min(Math.max(saldo,0), sumaVencida)). Sin este tope, un cliente con
-- abonos que no cancelan puntualmente un cargo vencido (ej. un abono
-- genérico de cuenta corriente) podía mostrar más "vencido" que deuda real
-- — caso real: Ramon Eudoro Navarro con $193.750 vencido sobre $103.750 de
-- deuda total.
create or replace function saldos_cuenta_corriente()
returns table (cliente_id uuid, saldo numeric, vencido numeric)
language sql
security definer
stable
as $$
  select
    cliente_id,
    saldo,
    least(greatest(saldo, 0), suma_vencida) as vencido
  from (
    select
      m.cliente_id,
      sum(case when m.tipo = 'cargo' then m.monto else -m.monto end) as saldo,
      sum(case
            when m.tipo = 'cargo' and m.vencimiento is not null and m.vencimiento < current_date
            then m.monto else 0 end) as suma_vencida
    from cta_cte_movimientos m
    where m.negocio_id = negocio_actual() and not m.anulado
    group by m.cliente_id
  ) sub
$$;
