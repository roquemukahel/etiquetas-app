-- ============================================================
-- QOVENTO — "Quién recibió" la operación (compra/canje), separado de "quién
-- agregó el equipo al Stock" (dispositivos.agregado_por_nombre, ya existía).
--
-- Pedido real del usuario (2026-11-24): cargó él mismo un dispositivo desde
-- Compras/Plan Canje y después, en la ficha del Stock, apareció agregado a
-- nombre de otra persona. La causa real de ESE caso puntual era un bug de
-- carrera en app/compras/[id]/page.tsx (ver commit de ese mismo día), ya
-- corregido en el código sin necesitar SQL. Pero además, ni `compras` ni
-- `canjes` guardaban quién recibió esa compra/ese canje en el momento de
-- cargarlo — solo quedaba registrado quién lo agrega al Stock, que puede
-- ser otra persona y en otro momento. Mismo criterio que
-- servicio_tecnico_recibido_por_supabase.sql (reparaciones.recibido_por_nombre),
-- acá para compras y canjes.
--
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================

alter table compras add column if not exists recibido_por_nombre text;
alter table compras add column if not exists recibido_por_foto_url text;

alter table canjes add column if not exists recibido_por_nombre text;
alter table canjes add column if not exists recibido_por_foto_url text;
