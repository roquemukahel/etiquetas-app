-- ============================================================
-- Checklist de ingreso de Servicio Técnico: dos ítems nuevos
-- "Pin de carga" y "Carga MagSafe" (van después de "Botón Volumen"
-- y antes de "Humedad / manipulación").
--
-- Es aditivo e idempotente (add column if not exists): se puede correr
-- las veces que haga falta sin romper nada. CORRER ESTO ANTES de que
-- el código nuevo llegue a producción, porque el guardado de una
-- reparación escribe estas columnas.
-- ============================================================
alter table reparaciones add column if not exists pin_carga_ok boolean;
alter table reparaciones add column if not exists carga_magsafe_ok boolean;
