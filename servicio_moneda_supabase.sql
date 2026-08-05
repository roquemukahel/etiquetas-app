-- ============================================================
-- QOVENTO — Moneda por reparación en Servicio Técnico
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- ============================================================

-- Moneda del cobro de una reparación (peso, dólar, etc.). Si está vacía, se
-- usa la moneda principal del negocio. Se elige en la ficha de la reparación
-- cuando el negocio tiene más de una moneda habilitada, y se traslada a la
-- orden de cobro (y por lo tanto a la boleta).
alter table reparaciones add column if not exists moneda text;
