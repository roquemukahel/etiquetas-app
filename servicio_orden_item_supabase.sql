-- Liga cada reparación al ítem PUNTUAL de la orden que la cobra, en vez de
-- asumir "el primer ítem de la orden" (rompía cuando una orden tenía más de
-- un equipo o un accesorio junto con el servicio técnico).
--
-- Correr una sola vez en el SQL Editor de Supabase.

alter table reparaciones add column if not exists orden_item_id uuid references orden_items(id) on delete set null;
