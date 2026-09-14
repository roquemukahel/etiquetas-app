-- ============================================================
-- Limpieza de TODOS los datos de prueba generados hoy (2026-09-13)
-- probando Plan canje + completar Plan de ahorro. Esto borra:
--
--  1) Los 2 planes de ahorro de prueba de "Roque Mukahel"
--     (iPhone 7 Plus 128GB Oro y 256GB Product Red — SEÑA), y sus
--     abonos (se borran solos por cascada al borrar el plan).
--  2) Los 3 equipos de prueba que quedaron en Plan Canje
--     (iPhone 8 64GB $30, iPhone XR $60, Samsung A16 $40).
--  3) Las 2 órdenes/boletas de prueba que se generaron al completar
--     esos planes (#F-000084 y #F-000085) y sus ítems.
--  4) Devuelve a Stock el iPhone 7 Plus 256GB Product Red que la
--     SEÑA había marcado como vendido.
--
-- Revisá los IDs de abajo antes de correr — son los que se generaron
-- en las pruebas de esta conversación, no deberían tocar nada real.
-- ============================================================

-- 1) Los canjes de prueba (uno de ellos, el iPhone 8, se cargó antes de
--    que existiera la columna plan_ahorro_movimiento_id, así que no
--    tiene ese link — se identifica por modelo/monto en vez de por FK).
delete from canjes
where plan_ahorro_movimiento_id in (
  select id from plan_ahorro_movimientos
  where plan_id in ('b1b56388-4e2e-48d3-a31b-a60471d028eb', '32e66b98-48ab-45a5-8e52-b11ec329b973')
)
or (modelo ilike '%iphone 8%' and monto = 30 and cliente_id = (
  select cliente_id from planes_ahorro where id = 'b1b56388-4e2e-48d3-a31b-a60471d028eb'
));

-- 2) Las 2 órdenes/boletas de prueba y sus ítems.
delete from orden_items where orden_id in (
  'e83bb94c-6ade-469d-9d9c-d1fa0d444f8f', -- #F-000084
  'a8e943e6-6d83-45ed-8a3b-d2562fa3975a'  -- #F-000085
);
delete from ordenes where id in (
  'e83bb94c-6ade-469d-9d9c-d1fa0d444f8f',
  'a8e943e6-6d83-45ed-8a3b-d2562fa3975a'
);

-- 3) Devolver a Stock el equipo de la seña (quedó marcado como vendido
--    al completar el plan de prueba).
update dispositivos set en_stock = true
where id = (select dispositivo_id from planes_ahorro where id = '32e66b98-48ab-45a5-8e52-b11ec329b973');

-- 4) Los 2 planes de ahorro de prueba (borra en cascada sus abonos).
delete from planes_ahorro where id in (
  'b1b56388-4e2e-48d3-a31b-a60471d028eb',
  '32e66b98-48ab-45a5-8e52-b11ec329b973'
);
