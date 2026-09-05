-- ============================================================
-- Proveedores: Sucursal y Área en "Cargar compra" y "Registrar pago/deuda"
-- (2026-09-04) — pedido de un cliente, relayado por roque.
--
-- Hoy compras_proveedor y proveedor_movimientos son compartidos entre
-- sucursales/áreas: si dos sucursales le compran o le pagan al mismo
-- proveedor, todo se mezcla en un solo saldo sin poder distinguir qué
-- corresponde a cuál. Mismo patrón que ya usan egresos/pagos/ordenes
-- (sucursal_id nullable = negocio sin multisucursal; area_id nullable =
-- negocio que no usa el módulo de Áreas de egresos).
-- ============================================================

alter table compras_proveedor add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
alter table compras_proveedor add column if not exists area_id uuid references egresos_areas(id) on delete set null;
create index if not exists idx_compras_proveedor_sucursal on compras_proveedor(negocio_id, sucursal_id);

alter table proveedor_movimientos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
alter table proveedor_movimientos add column if not exists area_id uuid references egresos_areas(id) on delete set null;
create index if not exists idx_proveedor_movimientos_sucursal on proveedor_movimientos(negocio_id, sucursal_id);
