-- ============================================================
-- QOVENTO — Fundamentos de Analítica (Estadísticas v2)
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- ============================================================

-- 1) Costo de cada línea de la orden, capturado al momento de vender
--    (snapshot). Para dispositivos se copia dispositivos.costo; para
--    accesorios del catálogo, productos.costo. Sin esto no se puede
--    calcular el margen real de una venta (el costo de un equipo puede
--    cambiar o el equipo borrarse). Es opcional: si la línea no tenía
--    costo cargado, queda null y esa venta no aporta al margen.
alter table orden_items add column if not exists costo numeric;

-- 2) Permiso "Ver costos y ganancias". A DIFERENCIA del resto de los
--    permisos (default true), este arranca en FALSE: los costos y la
--    ganancia son información sensible del dueño. Por defecto SOLO el
--    administrador los ve; el admin puede habilitárselo a vendedores/
--    técnicos puntuales desde Configuración.
alter table vendedores add column if not exists puede_ver_costos boolean not null default false;
alter table tecnicos add column if not exists puede_ver_costos boolean not null default false;
