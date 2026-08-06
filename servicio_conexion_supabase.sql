-- ============================================================
-- QOVENTO — Servicio Técnico: conexión con Órdenes + checklist nuevo
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- ============================================================

-- 1) Checklist más granular en reparaciones:
--    - senal_ok: la SEÑAL, separada del módulo (antes era un solo "Módulo/Señal").
--    - boton_silencio_ok: el interruptor de silencio/mute.
alter table reparaciones add column if not exists senal_ok boolean;
alter table reparaciones add column if not exists boton_silencio_ok boolean;

-- 2) Conexión Órdenes -> Servicio Técnico: el checklist que carga el vendedor
--    en Nueva Orden se guarda estructurado en la orden (jsonb), para poder
--    copiarlo tal cual a la reparación al derivar (que el técnico NO recargue).
alter table ordenes add column if not exists checklist_ingreso jsonb;

-- 3) Conexión Servicio Técnico -> Órdenes: aclaraciones del técnico (lo que se
--    hizo / pruebas) que viajan a la orden de cobro y SE IMPRIMEN en la boleta
--    en un cuadro aparte cuando el cliente retira el equipo.
alter table ordenes add column if not exists aclaraciones_tecnico text;
