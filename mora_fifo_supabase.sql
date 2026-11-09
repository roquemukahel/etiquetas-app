-- ============================================================
-- Mora y vencido bien calculados: los pagos se imputan a la deuda MÁS VIEJA primero (FIFO) (2026-11-09)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras.
--
-- Reclamo real de un cliente: clientes que pagaron todo lo vencido seguían "En mora" por el monto ORIGINAL de cargos viejos, y
-- los días de atraso se contaban desde un cargo ya pagado. Ahora:
--   vencido = (suma de cargos con vencimiento anterior a hoy) - (total pagado), nunca menos de cero
--   (equivale a aplicar cada pago al cargo más viejo primero); si da cero, el cliente está AL DÍA.
--   Los días de atraso se cuentan desde el vencimiento más viejo que todavía tiene saldo impago.
--   Un cargo sin fecha de vencimiento NO cuenta como vencido.
--   Se devuelve separado el vencido que viene de cuotas de financiación y el de cuenta corriente / fiado (Estadísticas los muestra aparte).
--   Un cargo de una cuota de financiación toma el vencimiento de la cuota si el movimiento no lo trae.
--   "Resto mínimo para considerar mora" (negocios.mora_tolerancia, se elige en Configuración → Financiación en cuotas):
--   un vencido menor o igual a ese monto no deja al cliente en mora (restos de centavos).
--
-- También se deja de borrar el vencimiento del cargo cuando una cuota se paga (antes eso dejaba cuotas "sin fecha de
-- vencimiento" en la cuenta corriente) y se restauran los que ya estaban borrados.
-- ============================================================

alter table negocios add column if not exists mora_tolerancia numeric not null default 0;

-- 1) Saldo, vencido y desde cuándo está vencido, por cliente.
drop function if exists saldos_cuenta_corriente();
create or replace function saldos_cuenta_corriente(p_cliente_id uuid default null)
returns table (cliente_id uuid, saldo numeric, vencido numeric, vencimiento_impago date, proximo_vencimiento date, proximo_monto numeric, vencido_cuotas numeric, vencido_fiado numeric)
language sql
security definer
stable
as $$
  with movs as (
    select m.id, m.cliente_id, m.tipo, m.monto, m.fecha,
           coalesce(m.vencimiento, c.fecha_vencimiento) as venc,
           (m.cuota_id is not null) as es_cuota
    from cta_cte_movimientos m
    left join financiacion_cuotas c on c.id = m.cuota_id
    where m.negocio_id = negocio_actual() and not m.anulado
      and (p_cliente_id is null or m.cliente_id = p_cliente_id)
  ),
  pagado as (
    select cliente_id, sum(monto) as total from movs where tipo <> 'cargo' group by cliente_id
  ),
  cargos as (
    select cliente_id, venc, monto, es_cuota,
           sum(monto) over (
             partition by cliente_id order by (venc is null), venc, fecha, id
             rows between unbounded preceding and current row
           ) as acumulado
    from movs where tipo = 'cargo'
  ),
  impagos as (
    select c.cliente_id, c.venc, c.es_cuota,
           greatest(0, least(c.monto, c.acumulado - coalesce(p.total, 0))) as impago
    from cargos c
    left join pagado p on p.cliente_id = c.cliente_id
  ),
  vencidos as (
    select cliente_id, sum(impago) as vencido, min(venc) filter (where impago > 0.009) as desde,
           sum(impago) filter (where es_cuota) as vencido_cuotas,
           sum(impago) filter (where not es_cuota) as vencido_fiado
    from impagos
    where venc is not null and venc < current_date
    group by cliente_id
  ),
  umbral as (
    select greatest(coalesce((select mora_tolerancia from negocios where id = negocio_actual()), 0), 0.009) as v
  ),
  -- Próximo vencimiento: el cargo más viejo (de cualquier fecha) que todavía tiene saldo impago, ignorando restos menores al umbral.
  proximos as (
    select distinct on (cliente_id) cliente_id, venc, impago
    from impagos
    where venc is not null and impago > (select v from umbral)
    order by cliente_id, venc
  ),
  saldos as (
    select cliente_id, sum(case when tipo = 'cargo' then monto else -monto end) as saldo
    from movs group by cliente_id
  )
  select s.cliente_id,
         s.saldo,
         case when coalesce(v.vencido, 0) > (select v from umbral) then v.vencido else 0 end as vencido,
         case when coalesce(v.vencido, 0) > (select v from umbral) then v.desde end as vencimiento_impago,
         p.venc as proximo_vencimiento,
         p.impago as proximo_monto,
         case when coalesce(v.vencido, 0) > (select v from umbral) then coalesce(v.vencido_cuotas, 0) else 0 end as vencido_cuotas,
         case when coalesce(v.vencido, 0) > (select v from umbral) then coalesce(v.vencido_fiado, 0) else 0 end as vencido_fiado
  from saldos s
  left join vencidos v on v.cliente_id = s.cliente_id
  left join proximos p on p.cliente_id = s.cliente_id
$$;

grant execute on function saldos_cuenta_corriente(uuid) to authenticated;

-- 2) Aplicar un pago a las cuotas: igual que antes, SIN borrar el vencimiento del cargo de la cuota pagada.
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

    perform financiacion_actualizar_estado_plan(v_cuota_id);
  end loop;
end $$;

-- 3) Cargos de cuotas que quedaron sin fecha de vencimiento: se les devuelve la de su cuota.
update cta_cte_movimientos m
set vencimiento = c.fecha_vencimiento
from financiacion_cuotas c
where m.cuota_id = c.id
  and m.tipo = 'cargo'
  and m.vencimiento is null;
