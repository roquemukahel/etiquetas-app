-- ============================================================
-- Repuestos: precio final al cliente + mano de obra automática
-- (2026-09-24) — pedido real del dueño.
--
-- Hoy un repuesto solo tenía "costo por unidad" (lo que sale comprarlo). Se
-- agrega "precio de venta" (lo que se le cobra al cliente, YA incluyendo
-- mano de obra) — la diferencia entre los dos es la mano de obra de ese
-- repuesto, y se calcula sola, no hace falta cargarla aparte.
--
-- Cuando un técnico usa un repuesto en una reparación (repuesto_consumir):
--   - se guarda una FOTO del precio de venta de ese momento en
--     reparaciones_repuestos.precio_venta_unitario (mismo criterio que ya
--     existía para costo_unitario: un cambio de precio después no debe
--     alterar reparaciones ya hechas).
--   - se suma ese precio al presupuesto de repuestos de la reparación
--     (reparaciones.presupuesto_repuestos), PERO SOLO si esa reparación
--     todavía no tiene un importe_total fijado a mano NI un presupuesto YA
--     APROBADO por el cliente (presupuesto_estado = 'aprobado') — si el
--     precio final ya se pactó o el cliente ya aprobó un monto puntual,
--     cambiarlo después sin que nadie lo pida sería un bug, no una ayuda
--     (y además dejaría "aprobado" pegado a un monto que ya no es el que
--     se aprobó).
-- ============================================================

alter table repuestos add column if not exists precio_venta numeric;
alter table reparaciones_repuestos add column if not exists precio_venta_unitario numeric;

create or replace function repuesto_consumir(
  p_repuesto_id uuid,
  p_reparacion_id uuid,
  p_cantidad numeric,
  p_actor_nombre text,
  p_forzar boolean default false
)
returns void
language plpgsql
as $$
declare
  v_repuesto repuestos%rowtype;
  v_nuevo_stock numeric;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into v_repuesto from repuestos where id = p_repuesto_id for update;
  if not found then
    raise exception 'El repuesto no existe';
  end if;

  v_nuevo_stock := v_repuesto.cantidad_stock - p_cantidad;
  if v_nuevo_stock < 0 and not p_forzar then
    raise exception 'STOCK_INSUFICIENTE:%', v_repuesto.cantidad_stock;
  end if;

  update repuestos set cantidad_stock = v_nuevo_stock where id = p_repuesto_id;

  insert into reparaciones_repuestos (reparacion_id, repuesto_id, nombre_repuesto, cantidad, costo_unitario, precio_venta_unitario, actor_nombre)
  values (p_reparacion_id, p_repuesto_id, v_repuesto.nombre, p_cantidad, v_repuesto.costo_unitario, v_repuesto.precio_venta, p_actor_nombre);

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, reparacion_id, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, 'consumo', -p_cantidad, v_repuesto.costo_unitario, p_reparacion_id, p_actor_nombre);

  update reparaciones
  set presupuesto_repuestos = coalesce(presupuesto_repuestos, 0) + coalesce(v_repuesto.precio_venta, 0) * p_cantidad
  where id = p_reparacion_id and importe_total is null and presupuesto_estado is distinct from 'aprobado';
end;
$$;

create or replace function repuesto_quitar_consumo(
  p_reparacion_repuesto_id uuid,
  p_actor_nombre text
)
returns void
language plpgsql
as $$
declare
  v_uso reparaciones_repuestos%rowtype;
begin
  select * into v_uso from reparaciones_repuestos where id = p_reparacion_repuesto_id;
  if not found then
    raise exception 'No encontramos ese repuesto usado';
  end if;

  delete from reparaciones_repuestos where id = p_reparacion_repuesto_id;

  if v_uso.repuesto_id is not null then
    update repuestos set cantidad_stock = cantidad_stock + v_uso.cantidad where id = v_uso.repuesto_id;
    insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, reparacion_id, actor_nombre)
    values (v_uso.repuesto_id, v_uso.nombre_repuesto, 'devolucion', v_uso.cantidad, v_uso.costo_unitario, v_uso.reparacion_id, p_actor_nombre);
  end if;

  -- Reversa el mismo monto que se había sumado al presupuesto al usar este
  -- repuesto (mismo resguardo: solo si el presupuesto sigue abierto). Nunca
  -- baja de 0 — si el presupuesto ya se editó a mano después, restar a
  -- ciegas podría dejarlo negativo.
  update reparaciones
  set presupuesto_repuestos = greatest(0, coalesce(presupuesto_repuestos, 0) - coalesce(v_uso.precio_venta_unitario, 0) * v_uso.cantidad)
  where id = v_uso.reparacion_id and importe_total is null and presupuesto_estado is distinct from 'aprobado';
end;
$$;
