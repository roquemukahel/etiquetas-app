-- ============================================================
-- Servicio Técnico PRO — Fase 6 (checkpoints 3 y 4): control de
-- calidad antes de entregar (sección 17) + garantías y retrabajos
-- (sección 21).
--
-- Aditivo e idempotente. CORRER ESTO ANTES de que el código nuevo
-- llegue a producción.
-- ============================================================

-- ============================================================
-- Control de calidad: un renglón por ítem controlado en una
-- reparación. El checklist aplicable sale de `trabajos.checklist_tecnico`
-- de los servicios realizados (Fase 4) — si ninguno tiene checklist
-- cargado, el código usa una lista genérica por defecto (no vive en la
-- base, es una constante en lib/reparaciones.ts, así que no hace falta
-- una tabla de "checklists configurables" para el caso general).
-- unique(reparacion_id, item) permite hacer upsert al recontrolar un
-- ítem en vez de acumular duplicados.
-- ============================================================
create table if not exists reparaciones_control_calidad (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  item text not null,
  resultado text not null,
  observacion text,
  foto_url text,
  actor_nombre text,
  created_at timestamptz not null default now(),
  unique (reparacion_id, item)
);

alter table reparaciones_control_calidad enable row level security;
create policy "reparaciones_control_calidad de mi negocio" on reparaciones_control_calidad
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- Registra cuando alguien marca "listo para entregar" sin haber
-- completado todos los controles obligatorios (override autorizado) —
-- separado de la auditoría genérica de cambio de estado para poder
-- contarlos fácil en Métricas más adelante.
alter table reparaciones add column if not exists control_calidad_override boolean not null default false;

-- ============================================================
-- Garantías y retrabajos: clasifica el ingreso y lo vincula a una
-- reparación anterior del mismo equipo (mismo IMEI). El margen y el
-- costo de cada reparación siguen siendo siempre los propios de esa
-- fila — vincular no copia ni reutiliza nada de la anterior.
-- ============================================================
alter table reparaciones add column if not exists tipo_ingreso text;
alter table reparaciones add column if not exists reparacion_relacionada_id uuid references reparaciones(id) on delete set null;
