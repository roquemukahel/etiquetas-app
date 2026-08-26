-- ============================================================
-- AUDITORÍA DE PERFORMANCE (2026-08-26) — hallazgo repetido en las 3
-- auditorías (Órdenes, Stock, resto de la app): ninguna tabla grande tiene
-- un índice por `negocio_id`, a pesar de que la política RLS de CADA tabla
-- filtra por `negocio_id = negocio_actual()` en TODA consulta (ver
-- supabase/schema.sql). Con varios negocios compartiendo la misma tabla,
-- sin este índice Postgres tiene que revisar fila por fila de TODOS los
-- negocios juntos para encontrar las tuyas — y empeora con cada negocio
-- nuevo que se suma al sistema, no solo con el crecimiento de este.
--
-- Pura adición de índices: no cambia ninguna consulta ni comportamiento de
-- la app, solo la acelera. Segura de correr en cualquier momento, incluso
-- con el sistema en uso (CONCURRENTLY evita bloquear la tabla mientras se
-- construye el índice — más lento de crear, pero sin cortar el servicio).
--
-- CONCURRENTLY no puede ir dentro de una transacción — cada create index
-- se ejecuta solo, así que si usás el SQL Editor de Supabase corré este
-- archivo tal cual (una sentencia a la vez, sin BEGIN/COMMIT envolvente).
-- ============================================================

-- Órdenes (listado, boletas, comisiones, todo lo que factura) — hallazgo
-- del auditor de Órdenes: sin esto, listar/ordenar órdenes y resolver la
-- policy de orden_items ("orden_id in (select id from ordenes where
-- negocio_id = ...)") escanea la tabla completa.
create index concurrently if not exists idx_ordenes_negocio_created on ordenes(negocio_id, created_at desc);
create index concurrently if not exists idx_ordenes_negocio_estado on ordenes(negocio_id, estado);
create index concurrently if not exists idx_ordenes_cliente on ordenes(cliente_id);
create index concurrently if not exists idx_orden_items_orden on orden_items(orden_id);

-- Stock (dispositivos y accesorios) — hallazgo del auditor de Stock:
-- Stock filtra siempre por negocio_id + en_stock, y el alta/edición
-- busca por IMEI para detectar duplicados.
create index concurrently if not exists idx_dispositivos_negocio_stock on dispositivos(negocio_id, en_stock);
create index concurrently if not exists idx_dispositivos_imei on dispositivos(negocio_id, imei) where imei is not null;
create index concurrently if not exists idx_productos_negocio on productos(negocio_id);

-- Cuentas por cobrar / Proveedores / Plan de ahorro — hallazgo del tercer
-- auditor: las 3 RPCs de saldo (saldos_cuenta_corriente, saldos_proveedores,
-- saldos_planes_ahorro) hacen "where negocio_id = ... group by <fk>" sobre
-- estas tablas, pero solo había índice en la FK del otro lado (cliente_id/
-- proveedor_id/plan_id), nunca en negocio_id.
create index concurrently if not exists idx_cta_cte_mov_negocio on cta_cte_movimientos(negocio_id) where not anulado;
create index concurrently if not exists idx_proveedor_mov_negocio on proveedor_movimientos(negocio_id) where not anulado;
create index concurrently if not exists idx_plan_ahorro_mov_negocio on plan_ahorro_movimientos(negocio_id) where not anulado;
