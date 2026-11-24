-- ============================================================
-- Salud de batería en las órdenes de Servicio Técnico (2026-11-04)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras.
--
-- Cuando un equipo pasa por Servicio Técnico (viene de una compra, de Plan Canje, del Stock o de Standby) la orden guarda
-- su porcentaje de batería, y al volver al Stock se copia al equipo. Antes ese dato se perdía en el camino.
-- ============================================================
alter table reparaciones add column if not exists salud_bateria int;

alter table reparaciones drop constraint if exists reparaciones_salud_bateria_valida;
alter table reparaciones add constraint reparaciones_salud_bateria_valida
  check (salud_bateria is null or salud_bateria between 1 and 100);
