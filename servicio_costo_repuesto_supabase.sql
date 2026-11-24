-- ============================================================
-- Servicio Técnico: ¿se usó repuesto? y costo pendiente (2026-11-18)
--
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo).
-- Mientras no se corra, Servicio Técnico y Estadísticas funcionan como siempre y la pregunta nueva no aparece.
--
-- Pedido real de un cliente: había reparaciones marcadas como listas sin repuesto asignado y Estadísticas mostraba ~99% de
-- margen en el taller, porque una reparación sin costo cargado se contaba como mano de obra pura (costo cero).
-- ============================================================

-- 1) Qué se respondió al pasar la reparación a "Listo para entregar":
--    del_stock = usó un repuesto del stock | pendiente = usó uno pero todavía no se cargó (costo pendiente) | sin_repuesto = no usó.
--    Vacío = nadie lo respondió todavía (reparaciones anteriores a esta función).
alter table reparaciones add column if not exists repuesto_decision text;
alter table reparaciones add column if not exists repuesto_decision_at timestamptz;
alter table reparaciones add column if not exists repuesto_decision_por text;
alter table reparaciones drop constraint if exists reparaciones_repuesto_decision_valida;
alter table reparaciones add constraint reparaciones_repuesto_decision_valida
  check (repuesto_decision is null or repuesto_decision in ('del_stock', 'pendiente', 'sin_repuesto'));
create index if not exists idx_reparaciones_repuesto_pendiente on reparaciones(negocio_id) where repuesto_decision = 'pendiente';

-- 2) La línea de la boleta de una reparación con costo pendiente no cuenta como ganancia: Estadísticas la deja afuera
--    del margen (y baja el % de reparaciones con costo cargado) hasta que se cargue el repuesto.
alter table orden_items add column if not exists costo_pendiente boolean not null default false;

-- ============================================================
-- OPCIONAL (recomendado, pero decidilo vos): marcar como "costo pendiente" las reparaciones que YA se cobraron o se marcaron
-- listas sin ningún repuesto cargado. Sirve para que aparezcan en el filtro "Reparaciones sin costo" y para que Estadísticas deje de
-- contarlas como 100% de ganancia. Las que de verdad no usaron repuesto se pueden confirmar una por una con "No usó repuesto".
-- Para aplicarlo, sacá los "--" de las líneas de abajo y corré el script de nuevo.
-- ============================================================
-- update orden_items oi
--    set costo = null, costo_pendiente = true
--   from reparaciones r
--  where r.orden_cobro_id = oi.orden_id
--    and oi.tipo = 'trabajo'
--    and coalesce(oi.costo, 0) = 0
--    and r.repuesto_decision is null
--    and not exists (select 1 from reparaciones_repuestos rr where rr.reparacion_id = r.id);
--
-- update reparaciones r
--    set repuesto_decision = 'pendiente'
--  where r.repuesto_decision is null
--    and r.estado in ('listo_para_entregar', 'entregado')
--    and not exists (select 1 from reparaciones_repuestos rr where rr.reparacion_id = r.id);
