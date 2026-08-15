-- Evidencia fotográfica + notas del técnico, visibles para el cliente en
-- /seguimiento/[token] (ej. "al abrir el equipo encontramos el módulo roto
-- y le faltaban 3 tornillos", con foto). Mismo mecanismo de token público
-- que ya usa seguimiento_publico.
create table if not exists reparaciones_evidencias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  foto_url text,
  nota text,
  actor_nombre text,
  created_at timestamptz not null default now()
);

alter table reparaciones_evidencias enable row level security;

create policy "reparaciones_evidencias de mi negocio" on reparaciones_evidencias
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

drop function if exists seguimiento_publico(uuid);

create or replace function seguimiento_publico(token uuid)
returns table (
  numero_orden text,
  modelo text,
  capacidad_gb int,
  color text,
  estado text,
  fecha_ingreso_servicio timestamptz,
  fecha_estimada date,
  fecha_reparado timestamptz,
  trabajos_realizados text[],
  nombre_cliente text,
  nombre_negocio text,
  logo_negocio text,
  evidencias jsonb
)
language sql
security definer
stable
as $$
  select
    r.numero_orden, r.modelo, r.capacidad_gb, r.color, r.estado,
    r.fecha_ingreso_servicio, r.fecha_estimada, r.fecha_reparado, r.trabajos_realizados,
    cli.nombre,
    n.nombre, n.logo_url,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'foto_url', e.foto_url,
        'nota', e.nota,
        'created_at', e.created_at
      ) order by e.created_at asc), '[]'::jsonb)
      from reparaciones_evidencias e
      where e.reparacion_id = r.id
    )
  from reparaciones r
  join negocios n on n.id = r.negocio_id
  left join clientes cli on cli.id = r.cliente_id
  where r.token_seguimiento = token
$$;

grant execute on function seguimiento_publico(uuid) to anon, authenticated;
