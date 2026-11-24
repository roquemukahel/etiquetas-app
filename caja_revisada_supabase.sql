-- ============================================================
-- Cierres de caja "revisados" (2026-11-05)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras.
--
-- Cada cierre de caja se puede tildar como "Revisada" cuando alguien lo controló; queda anotado quién y cuándo.
-- ============================================================
alter table caja_turnos add column if not exists revisada boolean not null default false;
alter table caja_turnos add column if not exists revisada_por text;
alter table caja_turnos add column if not exists revisada_en timestamptz;
