-- ============================================================
-- Subcategorías de stock (2026-11-10)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras. No toca ningún producto ni dispositivo.
--
-- Pedido real de un cliente: "ACC PARA CELULARES" juntaba casi todo lo que vende. Una subcategoría es una categoría de stock
-- que cuelga de otra (Accesorios → Cables, Cargadores, Vidrios 9D, Fundas). Un producto o equipo se asigna a la subcategoría
-- con el mismo campo categoria_id de siempre; la categoría "de arriba" se deduce de la subcategoría. Un solo nivel de subcategorías.
-- ============================================================

alter table stock_categorias add column if not exists padre_id uuid references stock_categorias(id) on delete set null;
create index if not exists idx_stock_categorias_padre on stock_categorias(padre_id);

-- El nombre era único por negocio entre las activas; ahora es único dentro del mismo "padre" (dos categorías distintas pueden
-- tener, por ejemplo, una subcategoría "Otros").
drop index if exists uq_stock_categorias_nombre_activa;
create unique index if not exists uq_stock_categorias_nombre_activa
  on stock_categorias(negocio_id, coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre))
  where not archivada;
