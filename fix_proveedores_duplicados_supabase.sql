-- ============================================================
-- Fix de un bug real (2026-08-29): asegurarProveedor/asegurarModelo
-- (app/lib/proveedores.ts, app/lib/modelos.ts) usaban .maybeSingle(), que
-- tira un error si la búsqueda encuentra MÁS de una fila. Como ese error
-- nunca se chequeaba, en cuanto un proveedor o una carpeta de modelo
-- quedaba duplicado por cualquier motivo, la función dejaba de poder
-- encontrarlo para siempre — cada carga siguiente creaba OTRO duplicado
-- más, en una bola de nieve sin fin (así un proveedor llegó a aparecer
-- repetido más de 50 veces). El código ya está corregido (usa .limit(1),
-- que nunca tira ese error); este script limpia los duplicados que ya
-- se llegaron a crear mientras el bug estuvo activo.
--
-- Seguro de re-correr: si no quedan duplicados, no hace nada.
-- Fusiona SIEMPRE hacia la fila más vieja (el "original") de cada grupo.
-- ============================================================

-- ---------- 1) Proveedores duplicados ----------
do $$
declare
  grupo record;
  canonico uuid;
  duplicados uuid[];
begin
  for grupo in
    select negocio_id, lower(trim(nombre)) as clave, array_agg(id order by created_at asc, id asc) as ids
    from proveedores
    group by negocio_id, lower(trim(nombre))
    having count(*) > 1
  loop
    canonico := grupo.ids[1];
    duplicados := grupo.ids[2:array_length(grupo.ids, 1)];

    -- dispositivos.proveedor_id (siempre existe)
    update dispositivos set proveedor_id = canonico where proveedor_id = any(duplicados);

    -- compras_proveedor.proveedor_id (siempre existe si proveedores existe)
    update compras_proveedor set proveedor_id = canonico where proveedor_id = any(duplicados);

    -- proveedor_movimientos.proveedor_id (cuentas por pagar)
    if to_regclass('public.proveedor_movimientos') is not null then
      update proveedor_movimientos set proveedor_id = canonico where proveedor_id = any(duplicados);
    end if;

    -- productos.proveedor_id (categorías de stock — puede no existir en todos los negocios)
    if exists (select 1 from information_schema.columns where table_name = 'productos' and column_name = 'proveedor_id') then
      execute 'update productos set proveedor_id = $1 where proveedor_id = any($2)' using canonico, duplicados;
    end if;

    -- egresos.proveedor_id (puede no existir)
    if exists (select 1 from information_schema.columns where table_name = 'egresos' and column_name = 'proveedor_id') then
      execute 'update egresos set proveedor_id = $1 where proveedor_id = any($2)' using canonico, duplicados;
    end if;

    -- productos_maestro.proveedor_id (puede no existir)
    if exists (select 1 from information_schema.columns where table_name = 'productos_maestro' and column_name = 'proveedor_id') then
      execute 'update productos_maestro set proveedor_id = $1 where proveedor_id = any($2)' using canonico, duplicados;
    end if;

    delete from proveedores where id = any(duplicados);
  end loop;
end $$;

-- ---------- 2) Carpetas de modelo duplicadas (modelos_stock) ----------
-- Nada referencia modelos_stock por id (dispositivos.modelo es texto
-- libre, ya coincide por nombre con cualquiera de las duplicadas) — alcanza
-- con borrar las copias de más, dejando la más vieja de cada grupo.
delete from modelos_stock a
using modelos_stock b
where a.negocio_id = b.negocio_id
  and lower(trim(a.nombre)) = lower(trim(b.nombre))
  and (a.created_at, a.id) > (b.created_at, b.id);
