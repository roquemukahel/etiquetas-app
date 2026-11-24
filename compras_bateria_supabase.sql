-- ============================================================
-- Salud de batería en las compras de dispositivos (2026-11-04)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras.
--
-- Hasta ahora la compra no tenía dónde cargar el porcentaje de batería y se escribía en "Detalles"; al pasar el equipo al
-- Stock ese texto no se leía como batería. Con esta columna la compra guarda el porcentaje (1 a 100) y al agregarla al
-- Stock se copia a la "Salud de batería" del equipo.
-- ============================================================
alter table compras add column if not exists salud_bateria int;

alter table compras drop constraint if exists compras_salud_bateria_valida;
alter table compras add constraint compras_salud_bateria_valida
  check (salud_bateria is null or salud_bateria between 1 and 100);
