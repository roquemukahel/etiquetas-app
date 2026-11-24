-- ============================================================
-- Cuotas del plan = cuenta corriente: cada pago a la cuenta corriente también se aplica a las cuotas (2026-11-09)
--
-- Correr en Supabase > SQL Editor > Run, DESPUÉS de mora_fifo_supabase.sql. Seguro de correr las veces que quieras.
--
-- Reclamo real de un cliente: la pestaña Financiaciones (cuotas del plan) y la cuenta corriente llevaban el saldo por
-- separado. Ejemplo: un cliente debía US$396 en la cuenta corriente y US$646 en las cuotas, porque US$250 se habían cobrado
-- a "cuenta corriente" sin tocar ninguna cuota.
--
-- Ahora, un pago que va a la cuenta corriente se reparte igual que el cálculo de mora: a la deuda MÁS VIEJA primero (sea una
-- cuota o un fiado), y la parte que cae sobre cuotas se aplica también a esas cuotas. Queda ligada al pago, así que si el pago
-- se anula o se corrige, las cuotas vuelven a su lugar como siempre.
--
-- 1) financiacion_aplicar_pago_cuenta_corriente(): la llama la app apenas registra un pago a cuenta corriente.
-- 2) Ajuste único: los pagos a cuenta corriente que ya se hicieron y no se aplicaron a las cuotas se aplican ahora, a las cuotas
--    más viejas (queda como "ajuste" en el historial de cada cuota, no como un cobro nuevo).
-- ============================================================

-- Cuánto de cada cuota quedaría pagado si se pagara `p_total_pagado` a la deuda más vieja primero.
create or replace function financiacion_fifo_por_cuota(p_cliente_id uuid, p_total_pagado numeric)
returns table (cuota_id uuid, pagado_fifo numeric)
language sql
security definer
stable
as $$
  with cargos as (
    select m.cuota_id, m.monto,
           sum(m.monto) over (
             order by (coalesce(m.vencimiento, c.fecha_vencimiento) is null), coalesce(m.vencimiento, c.fecha_vencimiento), m.fecha, m.id
             rows between unbounded preceding and current row
           ) as acumulado
    from cta_cte_movimientos m
    left join financiacion_cuotas c on c.id = m.cuota_id
    where m.negocio_id = negocio_actual() and m.cliente_id = p_cliente_id and not m.anulado and m.tipo = 'cargo'
  )
  select cuota_id, least(monto, greatest(0, p_total_pagado - (acumulado - monto))) as pagado_fifo
  from cargos
  where cuota_id is not null
$$;

-- Aplica a las cuotas la parte de ESTE pago que cae sobre cuotas (el abono del pago ya está en la cuenta corriente).
-- Devuelve cuánto se aplicó a cuotas (0 si el pago cayó entero sobre un fiado más viejo o el cliente no tiene cuotas).
create or replace function financiacion_aplicar_pago_cuenta_corriente(
  p_cliente_id uuid,
  p_pago_id uuid,
  p_monto numeric,
  p_usuario text
) returns numeric language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_total numeric;
  v_asig jsonb;
  v_aplicado numeric;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  select coalesce(sum(monto), 0) into v_total
  from cta_cte_movimientos
  where negocio_id = v_negocio and cliente_id = p_cliente_id and not anulado and tipo <> 'cargo';

  -- Lo que ESTE pago agrega a cada cuota = cómo quedan con todos los pagos menos cómo quedaban sin este.
  select jsonb_agg(jsonb_build_object('cuota_id', d.cuota_id, 'monto', d.delta)), coalesce(sum(d.delta), 0)
    into v_asig, v_aplicado
  from (
    select a.cuota_id,
           least(a.pagado_fifo - b.pagado_fifo, fc.importe_original - fc.importe_pagado) as delta
    from financiacion_fifo_por_cuota(p_cliente_id, v_total) a
    join financiacion_fifo_por_cuota(p_cliente_id, greatest(v_total - p_monto, 0)) b on b.cuota_id = a.cuota_id
    join financiacion_cuotas fc on fc.id = a.cuota_id and fc.negocio_id = v_negocio and fc.estado = 'pendiente'
    join financiacion_planes pl on pl.id = fc.plan_id and pl.estado = 'activo'
  ) d
  where d.delta > 0.009;

  if v_asig is null then return 0; end if;
  perform financiacion_aplicar_pago(p_pago_id, v_asig, p_usuario);
  return v_aplicado;
end $$;

grant execute on function financiacion_fifo_por_cuota(uuid, numeric) to authenticated;
grant execute on function financiacion_aplicar_pago_cuenta_corriente(uuid, uuid, numeric, text) to authenticated;

-- 2) Ajuste único de lo ya cobrado. Corre para todos los negocios (acá no hay sesión): por cada cuota pendiente de un plan
--    activo, si la deuda más vieja primero (FIFO) dice que debería tener más pagado que lo que tiene, se le suma la diferencia.
--    Nunca se le resta nada a una cuota ni se pasa del importe de la cuota.
do $$
declare
  r record;
begin
  create temp table _cuotas_a_conciliar on commit drop as
  with mov as (
    select m.id, m.cliente_id, m.tipo, m.monto, m.cuota_id, m.fecha,
           coalesce(m.vencimiento, c.fecha_vencimiento) as venc
    from cta_cte_movimientos m
    left join financiacion_cuotas c on c.id = m.cuota_id
    where not m.anulado
  ),
  pagado as (
    select cliente_id, sum(monto) as total from mov where tipo <> 'cargo' group by cliente_id
  ),
  cargos as (
    select cliente_id, cuota_id, monto,
           sum(monto) over (
             partition by cliente_id order by (venc is null), venc, fecha, id
             rows between unbounded preceding and current row
           ) as acumulado
    from mov where tipo = 'cargo'
  ),
  objetivo as (
    select c.cuota_id, least(c.monto, greatest(0, coalesce(p.total, 0) - (c.acumulado - c.monto))) as objetivo
    from cargos c
    left join pagado p on p.cliente_id = c.cliente_id
    where c.cuota_id is not null
  )
  select fc.id as cuota_id, fc.negocio_id,
         least(o.objetivo - fc.importe_pagado, fc.importe_original - fc.importe_pagado) as diferencia
  from objetivo o
  join financiacion_cuotas fc on fc.id = o.cuota_id and fc.estado = 'pendiente'
  join financiacion_planes pl on pl.id = fc.plan_id and pl.estado = 'activo'
  where o.objetivo - fc.importe_pagado > 0.009;

  insert into financiacion_pagos (negocio_id, cuota_id, pago_id, monto_aplicado, tipo, motivo, usuario)
  select negocio_id, cuota_id, null, diferencia, 'ajuste', 'Conciliación con la cuenta corriente', 'conciliación'
  from _cuotas_a_conciliar;

  update financiacion_cuotas fc
  set importe_pagado = fc.importe_pagado + t.diferencia,
      estado = case when fc.importe_pagado + t.diferencia >= fc.importe_original then 'pagada' else 'pendiente' end,
      fecha_pago_completo = case when fc.importe_pagado + t.diferencia >= fc.importe_original then now() else fc.fecha_pago_completo end,
      updated_at = now()
  from _cuotas_a_conciliar t
  where fc.id = t.cuota_id;

  for r in select cuota_id from _cuotas_a_conciliar loop
    perform financiacion_actualizar_estado_plan(r.cuota_id);
  end loop;
end $$;
