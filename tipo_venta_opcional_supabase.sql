-- Permite ocultar el selector "Minorista/Mayorista" de Nueva Orden para
-- negocios que no distinguen tipo de venta — pedido explícito de un negocio
-- que no usa mayorista y no encontraba forma de sacarlo. Default true
-- preserva el comportamiento actual para todos los negocios existentes (el
-- selector sigue apareciendo si comisiones_activas=true, como siempre).
-- Apagar este flag NO borra el histórico de tipo_venta ya guardado en
-- ordenes/comision_movimientos — solo hace que las órdenes NUEVAS queden
-- fijas en 'minorista' (el default de siempre).
alter table negocios add column if not exists mostrar_tipo_venta boolean not null default true;
