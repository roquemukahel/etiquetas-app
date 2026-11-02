-- Diagnóstico de consistencia de datos (SOLO LEE, no modifica nada). Pegalo en el SQL Editor de Supabase y corrélo:
-- devuelve una fila por chequeo con cuántos casos hay y unos ejemplos. "cantidad = 0" es lo esperado en todos.
-- Cubre todos los negocios juntos; los ejemplos traen el id del negocio para ubicarlos.
select * from (
  -- 1) Un equipo no puede estar a la vez en Stock y en Standby.
  select '1 · Equipo en Stock y en Standby a la vez' as chequeo, count(*) as cantidad,
         (select string_agg(coalesce(d.modelo, '?') || ' ' || coalesce(d.imei, 's/imei'), ' | ') from (select * from dispositivos where en_stock and en_espera limit 5) d) as ejemplos
  from dispositivos where en_stock and en_espera

  union all
  -- 2) IMEI repetido entre equipos que siguen vivos (en Stock o en Standby) del mismo negocio.
  select '2 · IMEI repetido entre equipos vivos', count(*),
         (select string_agg(imei || ' (x' || n || ')', ' | ') from (select imei, count(*) n from dispositivos where (en_stock or en_espera) and imei is not null and imei <> '' group by negocio_id, imei having count(*) > 1 limit 5) x)
  from (select 1 from dispositivos where (en_stock or en_espera) and imei is not null and imei <> '' group by negocio_id, imei having count(*) > 1) t

  union all
  -- 3) Un canje que ya se derivó a Servicio Técnico pero sigue apareciendo en Plan Canje (el caso de "volvió a Plan Canje").
  select '3 · Canje derivado a Servicio Técnico que sigue visible en Plan Canje', count(*),
         (select string_agg(coalesce(c.modelo, '?') || ' ' || coalesce(c.imei, 's/imei'), ' | ') from (select * from canjes c where c.estado = 'en_canje' and not c.agregado_a_stock and not coalesce(c.oculto_en_canje, false) and exists (select 1 from reparaciones r where r.canje_origen_id = c.id) limit 5) c)
  from canjes c where c.estado = 'en_canje' and not c.agregado_a_stock and not coalesce(c.oculto_en_canje, false) and exists (select 1 from reparaciones r where r.canje_origen_id = c.id)

  union all
  -- 4) Canje derivado cuya reparación ya pasó al Stock/Standby, pero el canje no figura como agregado (antes de la corrección de nov-2026 era lo normal).
  select '4 · Canje de origen sin marcar como agregado (reparación ya en Stock/Standby)', count(*),
         (select string_agg(coalesce(c.modelo, '?') || ' ' || coalesce(c.imei, 's/imei'), ' | ') from (select * from canjes c where not c.agregado_a_stock and exists (select 1 from reparaciones r where r.canje_origen_id = c.id and r.agregado_a_stock) limit 5) c)
  from canjes c where not c.agregado_a_stock and exists (select 1 from reparaciones r where r.canje_origen_id = c.id and r.agregado_a_stock)

  union all
  -- 5) Equipo en Stock cuyo IMEI sigue en una orden ABIERTA de Servicio Técnico de equipo propio (sin cliente).
  select '5 · Equipo en Stock con una orden de Servicio Técnico abierta con el mismo IMEI', count(*),
         (select string_agg(coalesce(d.modelo, '?') || ' ' || d.imei, ' | ') from (select d.* from dispositivos d where d.en_stock and d.imei is not null and exists (select 1 from reparaciones r where r.negocio_id = d.negocio_id and r.imei = d.imei and r.cliente_id is null and r.estado not in ('entregado', 'cancelado') and not coalesce(r.agregado_a_stock, false)) limit 5) d)
  from dispositivos d where d.en_stock and d.imei is not null and exists (select 1 from reparaciones r where r.negocio_id = d.negocio_id and r.imei = d.imei and r.cliente_id is null and r.estado not in ('entregado', 'cancelado') and not coalesce(r.agregado_a_stock, false))

  union all
  -- 6) Pagos activos de órdenes canceladas (inflan la caja).
  select '6 · Pago activo de una orden cancelada', count(*),
         (select string_agg(p.id::text, ' | ') from (select p.id from pagos p join ordenes o on o.id = p.orden_id where not p.anulado and o.estado = 'cancelado' limit 5) p)
  from pagos p join ordenes o on o.id = p.orden_id where not p.anulado and o.estado = 'cancelado'

  union all
  -- 7) Cuotas de financiación con más pagado que lo original.
  select '7 · Cuota con importe pagado mayor al original', count(*),
         (select string_agg(q.id::text, ' | ') from (select id from financiacion_cuotas where importe_pagado > importe_original + 0.01 limit 5) q)
  from financiacion_cuotas where importe_pagado > importe_original + 0.01

  union all
  -- 8) Órdenes pendientes en $0 con más de 14 días (restos de ventas que nunca se completaron).
  select '8 · Orden pendiente en $0 con más de 14 días', count(*),
         (select string_agg(o.id::text, ' | ') from (select id from ordenes where estado = 'pendiente' and coalesce(total, 0) = 0 and created_at < now() - interval '14 days' limit 5) o)
  from ordenes where estado = 'pendiente' and coalesce(total, 0) = 0 and created_at < now() - interval '14 days'
) r
order by 1;
