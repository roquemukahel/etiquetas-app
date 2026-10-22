-- ============================================================
-- QOVENTO — Standby: zona para equipos con defectos o en espera (ni en Stock vendible, ni en Servicio Técnico).
-- Un equipo en Standby sigue siendo una fila de `dispositivos` (conserva IMEI, fotos, historial y precio):
--   en_stock = false  y  en_espera = true.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
alter table dispositivos add column if not exists en_espera boolean not null default false;
alter table dispositivos add column if not exists en_espera_desde timestamptz;
alter table dispositivos add column if not exists espera_origen text;   -- 'stock' | 'canje' | 'servicio_tecnico' | 'manual'
alter table dispositivos add column if not exists espera_motivo text;   -- qué le pasa / por qué está en espera

create index if not exists idx_dispositivos_en_espera on dispositivos(negocio_id) where en_espera;
