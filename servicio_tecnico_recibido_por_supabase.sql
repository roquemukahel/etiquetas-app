-- ============================================================
-- QOVENTO — Servicio Técnico: quién recibió el equipo.
-- Hoy una orden de reparación queda "Vend.: Sin asignar" hasta que alguien la cobra, y en la ficha no
-- quedaba registrado quién la recibió. Esto guarda, al recibir el equipo, la persona que se identificó
-- con su PIN — aparte del vendedor que después la cobra.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
alter table reparaciones add column if not exists recibido_por_nombre text;
alter table reparaciones add column if not exists recibido_por_foto_url text;
