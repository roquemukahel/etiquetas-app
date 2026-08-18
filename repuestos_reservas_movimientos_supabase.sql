-- ============================================================
-- Servicio Técnico PRO — Fase 5: repuestos con reservas, movimientos
-- e historial atómico (sección 12/13 del rediseño).
--
-- Es aditivo e idempotente (tablas/columnas con "if not exists"; las
-- funciones con "create or replace" se pueden re-ejecutar sin
-- problema). CORRER ESTO ANTES de que el código nuevo llegue a
-- producción: la ficha de reparación y Repuestos pasan a llamar estas
-- funciones en vez de leer/escribir cantidad_stock directo desde el
-- cliente (eso tenía una condición de carrera real: dos consumos al
-- mismo tiempo podían pisarse y el stock terminaba mal).
-- ============================================================

-- Columnas nuevas y aditivas sobre `repuestos` (sección 12: filtros,
-- ficha completa del repuesto, reservas).
alter table repuestos add column if not exists cantidad_reservada integer not null default 0;
alter table repuestos add column if not exists categoria text;
alter table repuestos add column if not exists compatibilidad text;
alter table repuestos add column if not exists calidad text;
alter table repuestos add column if not exists sku text;
alter table repuestos add column if not exists codigo_barras text;
alter table repuestos add column if not exists ubicacion_fisica text;
alter table repuestos add column if not exists proveedor_id uuid references proveedores_repuestos(id) on delete set null;
alter table repuestos add column if not exists imagen_url text;
alter table repuestos add column if not exists stock_minimo integer;
alter table repuestos add column if not exists garantia_dias integer;
alter table repuestos add column if not exists observaciones text;

-- Columnas nuevas sobre `repuestos_precios` (sección 14: comparador de
-- proveedores con disponibilidad, tiempo de entrega y garantía).
alter table repuestos_precios add column if not exists disponible boolean not null default true;
alter table repuestos_precios add column if not exists tiempo_entrega_dias integer;
alter table repuestos_precios add column if not exists garantia_dias integer;
alter table repuestos_precios add column if not exists observaciones text;

-- ============================================================
-- Historial unificado de movimientos de stock: entrada, consumo,
-- reserva, liberación, ajuste, rotura, pérdida, devolución,
-- transferencia, corrección. `cantidad` es el delta con signo
-- aplicado (positivo = sumó stock/reserva, negativo = restó).
-- ============================================================
create table if not exists repuestos_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  repuesto_id uuid references repuestos(id) on delete set null,
  nombre_repuesto text not null,
  tipo text not null,
  cantidad numeric not null,
  costo_unitario numeric,
  reparacion_id uuid references reparaciones(id) on delete set null,
  motivo text,
  actor_nombre text,
  created_at timestamptz not null default now()
);

alter table repuestos_movimientos enable row level security;
create policy "repuestos_movimientos de mi negocio" on repuestos_movimientos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Reservas: separan stock "prometido" para una reparación del stock
-- realmente disponible para prometer a otra. disponible = cantidad_stock
-- - cantidad_reservada (se calcula en el momento, no se guarda).
-- estado: activa | liberada | consumida.
-- ============================================================
create table if not exists repuestos_reservas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  repuesto_id uuid not null references repuestos(id) on delete cascade,
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  cantidad numeric not null check (cantidad > 0),
  estado text not null default 'activa',
  actor_nombre text,
  created_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

alter table repuestos_reservas enable row level security;
create policy "repuestos_reservas de mi negocio" on repuestos_reservas
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Consumo directo de un repuesto en una reparación (reemplaza el
-- insert+update por separado que hacía el cliente). "for update"
-- bloquea la fila del repuesto hasta terminar la función: dos
-- consumos simultáneos del mismo repuesto quedan en fila en vez de
-- pisarse. Si no hay stock suficiente y no se fuerza, tira una
-- excepción "STOCK_INSUFICIENTE:<stock actual>" que el cliente
-- interpreta para ofrecer confirmar y reintentar con p_forzar=true
-- (mismo comportamiento que ya existía, ahora sin la condición de
-- carrera).
-- ============================================================
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

  insert into reparaciones_repuestos (reparacion_id, repuesto_id, nombre_repuesto, cantidad, costo_unitario, actor_nombre)
  values (p_reparacion_id, p_repuesto_id, v_repuesto.nombre, p_cantidad, v_repuesto.costo_unitario, p_actor_nombre);

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, reparacion_id, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, 'consumo', -p_cantidad, v_repuesto.costo_unitario, p_reparacion_id, p_actor_nombre);
end;
$$;

-- Deshace un consumo (botón "Quitar" en la ficha): borra la línea y
-- devuelve la cantidad al stock, todo en una sola función.
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
end;
$$;

-- Movimiento manual genérico (entrada / ajuste / rotura / pérdida /
-- devolución / transferencia / corrección) desde la pantalla de
-- Repuestos. p_cantidad es el delta con signo a aplicar.
create or replace function repuesto_registrar_movimiento(
  p_repuesto_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_motivo text,
  p_actor_nombre text
)
returns void
language plpgsql
as $$
declare
  v_repuesto repuestos%rowtype;
  v_nuevo_stock numeric;
begin
  if p_tipo not in ('entrada', 'ajuste', 'rotura', 'perdida', 'devolucion', 'transferencia', 'correccion') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;
  if p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;

  select * into v_repuesto from repuestos where id = p_repuesto_id for update;
  if not found then
    raise exception 'El repuesto no existe';
  end if;

  v_nuevo_stock := v_repuesto.cantidad_stock + p_cantidad;
  if v_nuevo_stock < 0 then
    raise exception 'STOCK_INSUFICIENTE:%', v_repuesto.cantidad_stock;
  end if;

  update repuestos
  set cantidad_stock = v_nuevo_stock,
      costo_unitario = coalesce(p_costo_unitario, costo_unitario)
  where id = p_repuesto_id;

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, motivo, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, p_tipo, p_cantidad, coalesce(p_costo_unitario, v_repuesto.costo_unitario), p_motivo, p_actor_nombre);
end;
$$;

-- Reserva un repuesto para una reparación puntual: nunca deja
-- prometer la misma pieza dos veces (si no hay disponible suficiente,
-- tira "DISPONIBLE_INSUFICIENTE:<disponible actual>" — a diferencia
-- del consumo directo, acá NO hay forzar: una reserva que promete algo
-- que no existe no tiene sentido).
create or replace function repuesto_reservar(
  p_repuesto_id uuid,
  p_reparacion_id uuid,
  p_cantidad numeric,
  p_actor_nombre text
)
returns uuid
language plpgsql
as $$
declare
  v_repuesto repuestos%rowtype;
  v_disponible numeric;
  v_reserva_id uuid;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into v_repuesto from repuestos where id = p_repuesto_id for update;
  if not found then
    raise exception 'El repuesto no existe';
  end if;

  v_disponible := v_repuesto.cantidad_stock - v_repuesto.cantidad_reservada;
  if p_cantidad > v_disponible then
    raise exception 'DISPONIBLE_INSUFICIENTE:%', v_disponible;
  end if;

  update repuestos set cantidad_reservada = cantidad_reservada + p_cantidad where id = p_repuesto_id;

  insert into repuestos_reservas (repuesto_id, reparacion_id, cantidad, actor_nombre)
  values (p_repuesto_id, p_reparacion_id, p_cantidad, p_actor_nombre)
  returning id into v_reserva_id;

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, reparacion_id, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, 'reserva', p_cantidad, p_reparacion_id, p_actor_nombre);

  return v_reserva_id;
end;
$$;

-- Libera una reserva activa (presupuesto rechazado / reparación
-- cancelada) sin tocar el stock físico, solo el reservado.
create or replace function repuesto_liberar_reserva(
  p_reserva_id uuid,
  p_actor_nombre text
)
returns void
language plpgsql
as $$
declare
  v_reserva repuestos_reservas%rowtype;
  v_nombre text;
begin
  select * into v_reserva from repuestos_reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'No encontramos esa reserva';
  end if;
  if v_reserva.estado <> 'activa' then
    raise exception 'Esta reserva ya no está activa';
  end if;

  update repuestos set cantidad_reservada = cantidad_reservada - v_reserva.cantidad where id = v_reserva.repuesto_id;
  update repuestos_reservas set estado = 'liberada', actualizado_at = now() where id = p_reserva_id;

  select nombre into v_nombre from repuestos where id = v_reserva.repuesto_id;
  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, reparacion_id, actor_nombre)
  values (v_reserva.repuesto_id, coalesce(v_nombre, 'repuesto eliminado'), 'liberacion', v_reserva.cantidad, v_reserva.reparacion_id, p_actor_nombre);
end;
$$;

-- Convierte una reserva activa en consumo real: descuenta stock físico
-- y reservado a la vez, y deja el mismo registro histórico con costo
-- inmutable que ya usa la ficha de reparación.
create or replace function repuesto_confirmar_reserva(
  p_reserva_id uuid,
  p_actor_nombre text
)
returns void
language plpgsql
as $$
declare
  v_reserva repuestos_reservas%rowtype;
  v_repuesto repuestos%rowtype;
begin
  select * into v_reserva from repuestos_reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'No encontramos esa reserva';
  end if;
  if v_reserva.estado <> 'activa' then
    raise exception 'Esta reserva ya no está activa';
  end if;

  select * into v_repuesto from repuestos where id = v_reserva.repuesto_id for update;
  if not found then
    raise exception 'El repuesto ya no existe';
  end if;

  update repuestos
  set cantidad_reservada = cantidad_reservada - v_reserva.cantidad,
      cantidad_stock = cantidad_stock - v_reserva.cantidad
  where id = v_reserva.repuesto_id;

  update repuestos_reservas set estado = 'consumida', actualizado_at = now() where id = p_reserva_id;

  insert into reparaciones_repuestos (reparacion_id, repuesto_id, nombre_repuesto, cantidad, costo_unitario, actor_nombre)
  values (v_reserva.reparacion_id, v_reserva.repuesto_id, v_repuesto.nombre, v_reserva.cantidad, v_repuesto.costo_unitario, p_actor_nombre);

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, reparacion_id, actor_nombre)
  values (v_reserva.repuesto_id, v_repuesto.nombre, 'consumo', -v_reserva.cantidad, v_repuesto.costo_unitario, v_reserva.reparacion_id, p_actor_nombre);
end;
$$;
