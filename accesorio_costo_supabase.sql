-- ============================================================
-- QOVENTO — Costo en accesorios (productos)
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
--
-- Los celulares (dispositivos) ya tenían "costo" (lo que le pagaste al
-- proveedor, distinto del precio de venta). Los accesorios (tabla
-- productos) tenían solo "precio". Se agrega "costo" para poder calcular
-- el capital invertido en stock también con los accesorios.
-- ============================================================

alter table productos add column if not exists costo numeric;
