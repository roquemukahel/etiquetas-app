-- ============================================================
-- QOVENTO — Área de egreso (Local / Taller / lo que el negocio use)
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. No toca ninguna tabla existente.
--
-- Por qué existe esto además de Sucursal: un negocio con más de una
-- sucursal puede además querer separar, DENTRO de cada sucursal, el
-- gasto del local de venta del gasto del taller de reparaciones (dos
-- áreas físicas distintas en la misma dirección). Sucursal × Área cubre
-- exactamente esa combinación (ej. "Sucursal Las Cejas" + "Taller") sin
-- tener que inventar sucursales ficticias como "Las Cejas - Taller" que
-- después arrastrarían su propio stock/ventas/servicio técnico, cosas
-- que un área de gasto no necesita. Igual que egresos_categorias, son
-- etiquetas 100% editables por el negocio — Local/Taller son solo el
-- punto de partida sugerido.
-- ============================================================
create table if not exists egresos_areas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  orden int not null default 0,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint egresos_areas_nombre_no_vacio check (length(trim(nombre)) > 0)
);
create unique index if not exists uq_egresos_areas_nombre_activa
  on egresos_areas(negocio_id, lower(nombre)) where not archivada;
create index if not exists idx_egresos_areas_negocio on egresos_areas(negocio_id, orden);

alter table egresos_areas enable row level security;
drop policy if exists "egresos_areas de mi negocio" on egresos_areas;
create policy "egresos_areas de mi negocio" on egresos_areas
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- Áreas de arranque, una sola vez por negocio (si ya tiene alguna
-- cargada —propia o de una corrida anterior de este mismo script—, no
-- inserta nada; se puede correr más de una vez sin duplicar).
do $$
declare
  v_negocio record;
begin
  for v_negocio in select id from negocios
  loop
    if not exists (select 1 from egresos_areas where negocio_id = v_negocio.id) then
      insert into egresos_areas (negocio_id, nombre, orden) values
        (v_negocio.id, 'Local', 0),
        (v_negocio.id, 'Taller', 1);
    end if;
  end loop;
end $$;

-- Columna en egresos — opcional, nullable: un negocio que no la usa
-- simplemente no la ve (el selector solo aparece en la UI si hay áreas
-- cargadas, mismo criterio que Sucursal solo aparece con 2+ sucursales).
alter table egresos add column if not exists area_id uuid references egresos_areas(id) on delete set null;
create index if not exists idx_egresos_area on egresos(area_id);
