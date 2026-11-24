-- ============================================================
-- Comisiones por categoría, sobre lo cobrado y reporte por categoría (2026-11-12)
--
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo; solo completa datos que están vacíos).
-- Mientras no se corra, el módulo de comisiones funciona como siempre y las opciones nuevas no aparecen.
--
-- Pedido real de un cliente: pagar comisión distinta según la categoría del producto (menos en templados y cables, más en iluminación),
-- generar la comisión de las ventas financiadas a medida que se cobran las cuotas y ver las comisiones agrupadas por categoría.
-- ============================================================

-- 1) Reglas: se pueden dirigir a una categoría (o subcategoría) de stock, y opcionalmente a una marca.
alter table comision_reglas add column if not exists categoria_id uuid references stock_categorias(id) on delete set null;
alter table comision_reglas add column if not exists marca text;
create index if not exists idx_comision_reglas_categoria on comision_reglas(categoria_id) where categoria_id is not null;

-- 2) Movimientos: cada comisión guarda la categoría (y marca) que tenía el producto al venderlo, para el reporte por categoría.
--    No es una clave foránea dura: se conserva aunque después se archive o se cambie la categoría.
alter table comision_movimientos add column if not exists categoria_id uuid;
alter table comision_movimientos add column if not exists marca text;
create index if not exists idx_comision_mov_categoria on comision_movimientos(negocio_id, categoria_id);

-- Las comisiones ya generadas toman la categoría actual de su producto o equipo (solo si todavía no la tenían).
update comision_movimientos m
   set categoria_id = p.categoria_id, marca = coalesce(m.marca, p.marca)
  from productos p
 where m.categoria_id is null and m.producto_id = p.id and p.categoria_id is not null;

update comision_movimientos m
   set categoria_id = d.categoria_id
  from orden_items oi
  join dispositivos d on d.id = oi.dispositivo_id
 where m.categoria_id is null and m.orden_item_id = oi.id and d.categoria_id is not null;

-- 3) Ventas financiadas: la comisión puede generarse a medida que se cobran las cuotas (apagado por defecto).
alter table negocios add column if not exists comisiones_sobre_cobrado boolean not null default false;

-- 4) Reversión de las comisiones de una venta cancelada o devuelta (reemplaza la de comisiones_supabase.sql).
--    Cambios: la reversión copia también la categoría y la marca (para que el reporte por categoría reste donde corresponde) y revierte
--    solo lo que todavía queda de cada comisión: si un pago anulado ya restó una parte (comisión sobre lo cobrado), no se resta dos veces.
create or replace function comision_revertir_orden(p_orden uuid, p_motivo text, p_usuario text)
returns int language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_count int := 0;
  v_pend numeric;
  r record;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  for r in
    select m.* from comision_movimientos m
    where m.negocio_id = v_negocio and m.orden_id = p_orden
      and m.tipo_movimiento = 'comision' and m.estado <> 'revertida'
  loop
    -- lo que falta revertir de esta comisión: su importe menos lo que ya restaron reversiones ligadas a ella
    v_pend := r.comision + coalesce((select sum(rev.comision) from comision_movimientos rev
                                      where rev.movimiento_original_id = r.id and rev.tipo_movimiento = 'reversion'), 0);
    if v_pend > 0.0001 then
      insert into comision_movimientos (negocio_id, vendedor_id, orden_id, orden_item_id, producto_id, tipo_item, categoria_id, marca,
        tipo_venta, tipo_movimiento, fecha_hecho, base, valor_regla, participacion, comision, moneda, plan_id,
        plan_version, regla_id, regla_snapshot, estado, movimiento_original_id, motivo, usuario)
      values (r.negocio_id, r.vendedor_id, r.orden_id, r.orden_item_id, r.producto_id, r.tipo_item, r.categoria_id, r.marca,
        r.tipo_venta, 'reversion', r.fecha_hecho, case when r.comision <> 0 then round(r.base * (v_pend / r.comision), 2) else r.base end,
        r.valor_regla, r.participacion, -v_pend, r.moneda, r.plan_id,
        r.plan_version, r.regla_id, r.regla_snapshot, 'generada', r.id, p_motivo, p_usuario);
      v_count := v_count + 1;
    end if;
    -- Si el original ya se pagó, NO se toca (la reversión queda pendiente para descontar en la próxima liquidación).
    if r.estado <> 'pagada' then
      update comision_movimientos set estado = 'revertida' where id = r.id;
    end if;
  end loop;
  return v_count;
end $$;
