-- ============================================================
-- QOVENTO — Compra de contado, rubro por compra, foto de factura y foto
-- mensual del inventario a costo (2026-10-07).
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- Mientras no se corra, Proveedores sigue funcionando como siempre (solo que no
-- ofrece "Compra de contado" ni rubro) y "Inversión por rubro" muestra lo que
-- ya existe (stock a costo y ventas).
-- ============================================================

-- 1) Compras a proveedores: rubro (categoría del Stock), grupo de la compra
--    (una compra repartida entre varios rubros son varias filas con el mismo
--    grupo) y foto de la factura.
alter table compras_proveedor add column if not exists categoria_id uuid references stock_categorias(id) on delete set null;
alter table compras_proveedor add column if not exists compra_grupo_id uuid;
alter table compras_proveedor add column if not exists tiene_factura boolean not null default false;
alter table compras_proveedor add column if not exists factura_url text;
create index if not exists idx_compras_proveedor_categoria on compras_proveedor(negocio_id, categoria_id);
create index if not exists idx_compras_proveedor_grupo on compras_proveedor(compra_grupo_id) where compra_grupo_id is not null;

-- La deuda y el pago de una compra de contado comparten el mismo grupo.
alter table proveedor_movimientos add column if not exists compra_grupo_id uuid;
create index if not exists idx_proveedor_movimientos_grupo on proveedor_movimientos(compra_grupo_id) where compra_grupo_id is not null;

-- 2) Foto mensual del inventario a costo, por rubro y sucursal. La toma sola un
--    proceso programado el día 1 de cada mes (fotografía el cierre del mes
--    anterior); nunca se edita a mano.
create table if not exists inventario_snapshots (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  mes date not null,                         -- primer día del mes que se fotografía
  categoria_id uuid references stock_categorias(id) on delete set null,
  sucursal_id uuid references sucursales(id) on delete set null,
  unidades integer not null default 0,
  costo_total numeric not null default 0,
  unidades_sin_costo integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_inventario_snapshots on inventario_snapshots(negocio_id, mes);

alter table inventario_snapshots enable row level security;
drop policy if exists "inventario_snapshots de mi negocio (lectura)" on inventario_snapshots;
create policy "inventario_snapshots de mi negocio (lectura)" on inventario_snapshots
  for select using (negocio_id = negocio_actual());
-- Sin política de insert/update/delete: solo la función de abajo (security
-- definer, la llama el proceso programado) escribe en esta tabla.

-- Fotografía el stock de TODOS los negocios al momento de correrla y lo guarda
-- bajo el mes indicado (por defecto, el mes anterior: la corre el día 1).
-- Idempotente: volver a correrla para el mismo mes reemplaza esa foto.
create or replace function inventario_tomar_foto(p_mes date default ((date_trunc('month', now()) - interval '1 month')::date))
returns integer
language plpgsql
security definer
as $$
declare
  v_filas integer;
begin
  delete from inventario_snapshots where mes = p_mes;

  insert into inventario_snapshots (negocio_id, mes, categoria_id, sucursal_id, unidades, costo_total, unidades_sin_costo)
  select negocio_id, p_mes, categoria_id, sucursal_id, sum(unidades), sum(costo_total), sum(sin_costo)
  from (
    select negocio_id, categoria_id, sucursal_id,
           1 as unidades,
           coalesce(costo, 0) as costo_total,
           case when costo is null then 1 else 0 end as sin_costo
    from dispositivos
    where en_stock
    union all
    select negocio_id, categoria_id, sucursal_id,
           cantidad as unidades,
           coalesce(costo, 0) * cantidad as costo_total,
           case when costo is null then cantidad else 0 end as sin_costo
    from productos
    where cantidad > 0
  ) x
  group by negocio_id, categoria_id, sucursal_id;

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

-- Solo el proceso programado (service role) puede dispararla.
revoke all on function inventario_tomar_foto(date) from public;
revoke all on function inventario_tomar_foto(date) from authenticated;
grant execute on function inventario_tomar_foto(date) to service_role;

-- OPCIONAL — para tener ya una primera foto (el mes en curso, hasta hoy):
--   select inventario_tomar_foto(date_trunc('month', now())::date);
