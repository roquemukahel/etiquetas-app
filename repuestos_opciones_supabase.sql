-- ============================================================
-- QOVENTO — Calidades y categorías de repuestos editables
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. No modifica ninguna tabla existente.
--
-- Los repuestos siguen guardando la calidad y la categoría como TEXTO
-- (repuestos.calidad / repuestos.categoria), así que no hay que migrar
-- ningún dato: esta tabla es solo la LISTA de opciones que cada negocio
-- ofrece al cargar un repuesto. Renombrar o borrar una opción actualiza
-- también los repuestos que ya la usan (dentro de una sola transacción,
-- con las funciones de abajo) — por eso van en la base y no en el cliente:
-- si fallara a mitad de camino quedarían repuestos con un nombre viejo.
-- ============================================================
create table if not exists repuestos_opciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  tipo text not null check (tipo in ('calidad', 'categoria')),
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  constraint repuestos_opciones_nombre_no_vacio check (length(trim(nombre)) > 0)
);
-- Sin distinguir mayúsculas: "Pantalla" y "pantalla" son la misma opción.
create unique index if not exists uq_repuestos_opciones_nombre
  on repuestos_opciones(negocio_id, tipo, lower(trim(nombre)));
create index if not exists idx_repuestos_opciones_negocio on repuestos_opciones(negocio_id, tipo, orden);

alter table repuestos_opciones enable row level security;
drop policy if exists "repuestos_opciones de mi negocio" on repuestos_opciones;
create policy "repuestos_opciones de mi negocio" on repuestos_opciones
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- Calidades de arranque (las que ya existían fijas en la app), una sola vez
-- por negocio: si ya tiene alguna cargada no inserta nada.
do $$
declare
  v_negocio record;
begin
  for v_negocio in select id from negocios
  loop
    if not exists (select 1 from repuestos_opciones where negocio_id = v_negocio.id and tipo = 'calidad') then
      insert into repuestos_opciones (negocio_id, tipo, nombre, orden) values
        (v_negocio.id, 'calidad', 'Original', 0),
        (v_negocio.id, 'calidad', 'OEM', 1),
        (v_negocio.id, 'calidad', 'Premium', 2),
        (v_negocio.id, 'calidad', 'Compatible', 3),
        (v_negocio.id, 'calidad', 'Otra', 4);
    end if;
  end loop;
end $$;

-- Las categorías de arranque salen de lo que cada negocio YA escribió en sus
-- repuestos (una por cada forma distinta ignorando mayúsculas, quedándose con
-- la más usada), así nadie arranca con la lista vacía ni pierde una categoría.
insert into repuestos_opciones (negocio_id, tipo, nombre, orden)
select negocio_id, 'categoria', nombre, (row_number() over (partition by negocio_id order by lower(nombre))) - 1
from (
  select distinct on (negocio_id, lower(trim(categoria)))
    negocio_id, trim(categoria) as nombre
  from (
    select negocio_id, categoria, count(*) over (partition by negocio_id, categoria) as usos
    from repuestos
    where categoria is not null and length(trim(categoria)) > 0
  ) c
  order by negocio_id, lower(trim(categoria)), usos desc, categoria
) distintas
on conflict do nothing;

-- Renombrar una opción y, en la MISMA transacción, todos los repuestos que la
-- usan (comparando sin mayúsculas ni espacios de más, así también se
-- unifican variantes como "pantalla" / "Pantalla ").
-- Si el nombre nuevo ya existe como otra opción, las UNIFICA: los repuestos de
-- la vieja pasan a la nueva y la vieja se borra. Devuelve cuántos repuestos
-- se actualizaron. security invoker: las políticas RLS de repuestos y de esta
-- tabla siguen aplicando al usuario que llama.
create or replace function repuestos_opcion_renombrar(p_id uuid, p_nuevo text)
returns int
language plpgsql
as $$
declare
  v_op repuestos_opciones%rowtype;
  v_nuevo text := trim(p_nuevo);
  v_otra uuid;
  v_cantidad int := 0;
begin
  if v_nuevo is null or length(v_nuevo) = 0 then
    raise exception 'NOMBRE_VACIO';
  end if;

  select * into v_op from repuestos_opciones where id = p_id;
  if not found then
    raise exception 'OPCION_NO_ENCONTRADA';
  end if;

  select id into v_otra
  from repuestos_opciones
  where tipo = v_op.tipo and id <> p_id and lower(trim(nombre)) = lower(v_nuevo);

  if v_op.tipo = 'calidad' then
    update repuestos set calidad = v_nuevo where lower(trim(calidad)) = lower(trim(v_op.nombre));
  else
    update repuestos set categoria = v_nuevo where lower(trim(categoria)) = lower(trim(v_op.nombre));
  end if;
  get diagnostics v_cantidad = row_count;

  if v_otra is not null then
    -- Unificar: la opción vieja desaparece, queda la que ya existía (con el
    -- nombre escrito como lo pidió el usuario).
    delete from repuestos_opciones where id = p_id;
    update repuestos_opciones set nombre = v_nuevo where id = v_otra;
  else
    update repuestos_opciones set nombre = v_nuevo where id = p_id;
  end if;

  return v_cantidad;
end;
$$;

-- Borrar una opción: los repuestos que la tenían quedan "sin especificar"
-- (nunca se borra un repuesto). Devuelve cuántos quedaron sin valor.
create or replace function repuestos_opcion_borrar(p_id uuid)
returns int
language plpgsql
as $$
declare
  v_op repuestos_opciones%rowtype;
  v_cantidad int := 0;
begin
  select * into v_op from repuestos_opciones where id = p_id;
  if not found then
    raise exception 'OPCION_NO_ENCONTRADA';
  end if;

  if v_op.tipo = 'calidad' then
    update repuestos set calidad = null where lower(trim(calidad)) = lower(trim(v_op.nombre));
  else
    update repuestos set categoria = null where lower(trim(categoria)) = lower(trim(v_op.nombre));
  end if;
  get diagnostics v_cantidad = row_count;

  delete from repuestos_opciones where id = p_id;
  return v_cantidad;
end;
$$;
