-- ============================================================
-- QOVENTO — Fotos reales de cada celular (opcionales): hasta 8 por equipo, con una miniatura chica para listas.
-- Van en su propia tabla (no en `dispositivos`) para que los listados de Stock no carguen imágenes pesadas.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
create table if not exists dispositivo_fotos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  foto_url text not null,          -- foto reducida (máx. ~1280 px)
  miniatura_url text,              -- miniatura (~320 px)
  orden int not null default 0,    -- la de menor "orden" es la principal
  actor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dispositivo_fotos_dispositivo on dispositivo_fotos(dispositivo_id, orden);

alter table dispositivo_fotos enable row level security;
drop policy if exists "dispositivo_fotos de mi negocio" on dispositivo_fotos;
create policy "dispositivo_fotos de mi negocio" on dispositivo_fotos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());
