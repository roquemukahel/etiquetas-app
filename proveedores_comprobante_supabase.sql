-- Proveedores / Plan de ahorro: texto configurable de "términos y
-- condiciones" para el comprobante de pago/deuda (Configuración > Datos
-- del negocio), igual que ya existe para la boleta de compras.
--
-- Correr una sola vez en el SQL Editor de Supabase.

alter table negocios add column if not exists texto_declaracion_proveedor text;
alter table negocios add column if not exists texto_declaracion_proveedor_tamano int not null default 11;
