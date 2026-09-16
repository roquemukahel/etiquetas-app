-- ============================================================
-- Clientes: apodo y localidad
-- (2026-09-16) — pedido real: hay clientes con sobrenombre/alias, y
-- clientes que no son de la zona del local — sin estos dos campos no
-- había forma de dejarlo asentado ni de encontrarlos después.
-- ============================================================

alter table clientes add column if not exists apodo text;
alter table clientes add column if not exists localidad text;
