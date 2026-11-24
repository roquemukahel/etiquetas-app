-- ============================================================
-- QOVENTO — Standby ↔ Servicio Técnico: la orden de reparación recuerda de qué equipo salió.
-- Así, cuando el equipo vuelve al Stock o a Standby, se reutiliza el MISMO equipo (con su IMEI, fotos e historial)
-- en vez de crear un duplicado. Correr DESPUÉS de standby_supabase.sql.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
alter table reparaciones add column if not exists dispositivo_origen_id uuid references dispositivos(id) on delete set null;
