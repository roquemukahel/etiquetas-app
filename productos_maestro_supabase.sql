-- ============================================================
-- QOVENTO — Catálogo maestro de productos (accesorios/genéricos).
-- Migración ADITIVA e IDEMPOTENTE. Correr en Supabase SQL Editor.
--
-- Por qué: hoy `productos` es UNA FILA POR SUCURSAL, sin relación entre
-- las filas de distintas sucursales que en realidad son "el mismo
-- producto" (mismo nombre/marca, cargado por separado en cada local). Esto
-- funcionaba bien mientras cada sucursal se miraba por separado, pero no
-- alcanza para: (1) una vista "Productos" que sume el stock de todas las
-- sucursales de forma exacta, y (2) un Remito Interno que sepa sin
-- ambigüedad a qué fila de la sucursal destino le tiene que sumar stock
-- cuando se transfiere.
--
-- Esta migración agrega una tabla `productos_maestro` (el "producto
-- lógico", una fila por negocio) y una columna `producto_maestro_id` en
-- `productos` que conecta cada fila-por-sucursal con su maestro. NO borra
-- ni reemplaza ninguna columna existente de `productos` — nombre, marca,
-- categoria_id, precio, costo, etc. siguen ahí y siguen siendo la fuente
-- de verdad para todo el código actual (Nueva Orden, Stock, órdenes ya
-- emitidas). El maestro es una capa nueva por encima, no un reemplazo.
--
-- El backfill de abajo crea un maestro por cada grupo de productos
-- existentes que comparten negocio + nombre + marca (comparados sin
-- mayúsculas ni espacios de más) y enlaza esas filas. Es seguro correrlo
-- más de una vez: la segunda vez ya no quedan filas con
-- producto_maestro_id null, así que no hace nada.
-- ============================================================

create table if not exists productos_maestro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  marca text,
  categoria_id uuid references stock_categorias(id) on delete set null,
  precio numeric,
  costo numeric,
  sku text,
  codigo_barras text,
  descripcion text,
  garantia_dias int,
  stock_minimo int,
  proveedor_id uuid references proveedores(id) on delete set null,
  imagen_url text,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  constraint productos_maestro_nombre_no_vacio check (length(trim(nombre)) > 0)
);

-- Evita crear dos maestros iguales (mismo nombre+marca) para el mismo
-- negocio mientras estén activos — un maestro archivado no bloquea crear
-- uno nuevo con el mismo nombre.
create unique index if not exists uq_productos_maestro_nombre_marca
  on productos_maestro (negocio_id, lower(trim(nombre)), lower(trim(coalesce(marca, ''))))
  where not archivado;
create index if not exists idx_productos_maestro_negocio on productos_maestro(negocio_id);
create index if not exists idx_productos_maestro_categoria on productos_maestro(categoria_id);

alter table productos_maestro enable row level security;
drop policy if exists "productos_maestro de mi negocio" on productos_maestro;
create policy "productos_maestro de mi negocio" on productos_maestro
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

alter table productos add column if not exists producto_maestro_id uuid references productos_maestro(id) on delete set null;
create index if not exists idx_productos_maestro_id on productos(producto_maestro_id);

-- ============================================================
-- BACKFILL idempotente: un maestro por cada grupo (negocio, nombre, marca)
-- entre las filas de `productos` que todavía no tienen producto_maestro_id.
-- Los datos descriptivos del maestro (categoría, precio, costo, sku, etc.)
-- se copian de la fila más reciente del grupo. Se puede correr las veces
-- que haga falta.
-- ============================================================
do $$
declare
  v_grupo record;
  v_maestro_id uuid;
  v_fuente record;
begin
  for v_grupo in
    select distinct negocio_id, lower(trim(nombre)) as nombre_norm, lower(trim(coalesce(marca, ''))) as marca_norm
    from productos
    where producto_maestro_id is null
  loop
    -- La fila más reciente del grupo aporta los datos descriptivos.
    select id, nombre, marca, categoria_id, precio, costo, sku, codigo_barras, descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url
      into v_fuente
      from productos
      where negocio_id = v_grupo.negocio_id
        and lower(trim(nombre)) = v_grupo.nombre_norm
        and lower(trim(coalesce(marca, ''))) = v_grupo.marca_norm
        and producto_maestro_id is null
      order by created_at desc
      limit 1;

    select id into v_maestro_id
      from productos_maestro
      where negocio_id = v_grupo.negocio_id
        and lower(trim(nombre)) = v_grupo.nombre_norm
        and lower(trim(coalesce(marca, ''))) = v_grupo.marca_norm
        and not archivado
      limit 1;

    if v_maestro_id is null then
      insert into productos_maestro (
        negocio_id, nombre, marca, categoria_id, precio, costo, sku, codigo_barras, descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url
      ) values (
        v_grupo.negocio_id, v_fuente.nombre, v_fuente.marca, v_fuente.categoria_id, v_fuente.precio, v_fuente.costo,
        v_fuente.sku, v_fuente.codigo_barras, v_fuente.descripcion, v_fuente.garantia_dias, v_fuente.stock_minimo,
        v_fuente.proveedor_id, v_fuente.imagen_url
      )
      returning id into v_maestro_id;
    end if;

    update productos
      set producto_maestro_id = v_maestro_id
      where negocio_id = v_grupo.negocio_id
        and lower(trim(nombre)) = v_grupo.nombre_norm
        and lower(trim(coalesce(marca, ''))) = v_grupo.marca_norm
        and producto_maestro_id is null;
  end loop;
end $$;
