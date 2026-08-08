-- ============================================================
-- ARREGLO: borrar un negocio para siempre fallaba con
--   "update or delete on table dispositivos violates foreign key
--    constraint orden_items_dispositivo_id_fkey"
--
-- Causa: varias foreign keys entre tablas del mismo negocio no tenían
-- "on delete", así que al borrar el negocio (que borra en cascada sus
-- dispositivos, clientes, vendedores, etc.) esas FKs bloqueaban el borrado.
--
-- Solución: que esas referencias NO bloqueen.
--  - Columnas opcionales (nullable) -> "on delete set null": si se borra
--    el equipo/cliente/vendedor referenciado, la referencia queda en null
--    y la fila (ej. la orden) se conserva. También es lo correcto en el
--    uso normal (borrar un equipo del stock no debería trabar una orden
--    vieja que lo mencionaba).
--  - Columnas obligatorias de comisiones (not null) -> "on delete cascade":
--    si se borra un vendedor, se van sus movimientos/liquidaciones.
--
-- Es idempotente (drop constraint if exists + add). Se puede correr varias
-- veces sin problema.
-- ============================================================

-- ordenes -> clientes / dispositivos / vendedores / canjes
alter table ordenes drop constraint if exists ordenes_cliente_id_fkey;
alter table ordenes add constraint ordenes_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;

alter table ordenes drop constraint if exists ordenes_dispositivo_id_fkey;
alter table ordenes add constraint ordenes_dispositivo_id_fkey
  foreign key (dispositivo_id) references dispositivos(id) on delete set null;

alter table ordenes drop constraint if exists ordenes_vendedor_id_fkey;
alter table ordenes add constraint ordenes_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete set null;

alter table ordenes drop constraint if exists ordenes_canje_id_fkey;
alter table ordenes add constraint ordenes_canje_id_fkey
  foreign key (canje_id) references canjes(id) on delete set null;

-- orden_items -> dispositivos  (la que reportó el error)
alter table orden_items drop constraint if exists orden_items_dispositivo_id_fkey;
alter table orden_items add constraint orden_items_dispositivo_id_fkey
  foreign key (dispositivo_id) references dispositivos(id) on delete set null;

-- canjes -> vendedores / tecnicos
alter table canjes drop constraint if exists canjes_vendedor_id_fkey;
alter table canjes add constraint canjes_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete set null;

alter table canjes drop constraint if exists canjes_tecnico_id_fkey;
alter table canjes add constraint canjes_tecnico_id_fkey
  foreign key (tecnico_id) references tecnicos(id) on delete set null;

-- compras -> clientes
alter table compras drop constraint if exists compras_cliente_id_fkey;
alter table compras add constraint compras_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;

-- comisiones (columnas not null) -> cascade
alter table comision_liquidaciones drop constraint if exists comision_liquidaciones_vendedor_id_fkey;
alter table comision_liquidaciones add constraint comision_liquidaciones_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete cascade;

alter table comision_movimientos drop constraint if exists comision_movimientos_vendedor_id_fkey;
alter table comision_movimientos add constraint comision_movimientos_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete cascade;
