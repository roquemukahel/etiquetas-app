-- ============================================================
-- Servicio Técnico PRO — Fase 4: catálogo de servicios ilustrado.
--
-- Columnas nuevas y ADITIVAS sobre `trabajos` (la misma tabla que ya
-- usa Nueva Orden para facturar un arreglo como ítem de una orden
-- común — NO se crea una tabla nueva ni se renombra esta, solo se le
-- suman campos, así que nada de lo que ya funciona se rompe).
--
-- Es idempotente (add column if not exists): se puede correr las
-- veces que haga falta sin romper nada. CORRER ESTO ANTES de que el
-- código nuevo llegue a producción, porque el catálogo de Servicios
-- ahora lee/escribe estas columnas.
-- ============================================================
alter table trabajos add column if not exists categoria text;
alter table trabajos add column if not exists descripcion_interna text;
alter table trabajos add column if not exists duracion_estimada_min integer;
alter table trabajos add column if not exists garantia_dias integer;
alter table trabajos add column if not exists compatibilidad text;
alter table trabajos add column if not exists repuesto_sugerido_id uuid references repuestos(id) on delete set null;
alter table trabajos add column if not exists checklist_tecnico text[];
alter table trabajos add column if not exists instrucciones_internas text;
-- "Archivar" (en vez de eliminar definitivamente) simplemente pone
-- activo = false: el servicio deja de ofrecerse para agregar a una
-- reparación nueva pero no desaparece de nada que ya lo haya usado.
alter table trabajos add column if not exists activo boolean not null default true;
alter table trabajos add column if not exists orden_visualizacion integer not null default 0;
