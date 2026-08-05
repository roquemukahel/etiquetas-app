-- ============================================================
-- QOVENTO — Detalles por dispositivo en el stock
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- ============================================================

-- Nota/observación libre por dispositivo (ej. "módulo con detalle",
-- "carcasa con un rayón"). Se muestra en la lista de stock si tiene algo.
alter table dispositivos add column if not exists detalles text;
