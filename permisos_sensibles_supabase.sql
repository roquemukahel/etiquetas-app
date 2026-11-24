-- ============================================================
-- QOVENTO — Permisos sensibles para vendedores y técnicos (todos APAGADOS por defecto):
--   • puede_cargar_egresos: carga gastos operativos y ve solo los que cargó (sin categorías de dueños ni
--     tipos Retiro/Ajuste).
--   • puede_registrar_pagos_proveedores: carga pagos a proveedores con comprobante, sin ver saldos, compras
--     ni precios de compra.
--   • puede_ver_costos: ve costos, ganancias y márgenes (Productos, Stock, repuestos, órdenes, etc.).
--     OJO: hasta ahora quien tenía "acceso completo" veía los costos; con este permiso eso pasa a ser una
--     casilla propia que arranca apagada para todos (el Administrador siempre los ve).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
alter table vendedores add column if not exists puede_cargar_egresos boolean not null default false;
alter table vendedores add column if not exists puede_registrar_pagos_proveedores boolean not null default false;
alter table vendedores add column if not exists puede_ver_costos boolean not null default false;

alter table tecnicos add column if not exists puede_cargar_egresos boolean not null default false;
alter table tecnicos add column if not exists puede_registrar_pagos_proveedores boolean not null default false;
alter table tecnicos add column if not exists puede_ver_costos boolean not null default false;
