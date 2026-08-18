-- Stock de repuestos para Servicio Técnico: cantidad disponible + costo por
-- repuesto (mismo patrón que ya usan los accesorios de Stock: productos.
-- cantidad/costo). reparaciones_repuestos registra qué repuestos se
-- consumieron en cada reparación, con el costo "congelado" al momento de
-- usarlo (igual que orden_items.costo) — así el margen de una reparación
-- vieja no cambia si después sube el precio del repuesto en el catálogo.
alter table repuestos add column if not exists cantidad_stock int not null default 0;
alter table repuestos add column if not exists costo_unitario numeric;

create table if not exists reparaciones_repuestos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  repuesto_id uuid references repuestos(id) on delete set null,
  -- Nombre "congelado" del repuesto: si después se borra o se renombra en el
  -- catálogo, la reparación vieja sigue mostrando qué se usó de verdad.
  nombre_repuesto text not null,
  cantidad int not null default 1,
  costo_unitario numeric,
  actor_nombre text,
  created_at timestamptz not null default now()
);

alter table reparaciones_repuestos enable row level security;

create policy "reparaciones_repuestos de mi negocio" on reparaciones_repuestos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());
