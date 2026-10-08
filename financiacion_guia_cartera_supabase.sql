-- ============================================================
-- QOVENTO — Guía de financiación por producto, dos precios, créditos fuera
-- de guía, localidades y sucursal de origen del cliente (2026-10-08).
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- Mientras no se corra, la app sigue funcionando como siempre: cada pantalla
-- detecta si estas columnas/tablas existen y, si no, no ofrece la función.
-- ============================================================

-- 1) GUÍA DE FINANCIACIÓN (hasta cuántas cuotas se puede ofrecer)
--    null = sin definir (hereda de la categoría; si la categoría tampoco, no hay guía)
--    0    = sin financiación (solo pago exclusivo: contado, transferencia o débito)
--    N    = financia hasta N cuotas
alter table stock_categorias add column if not exists financiacion_max_cuotas smallint;
alter table productos_maestro add column if not exists financiacion_max_cuotas smallint;
alter table productos add column if not exists financiacion_max_cuotas smallint;
alter table dispositivos add column if not exists financiacion_max_cuotas smallint;

-- 2) DOS PRECIOS: `precio` pasa a ser el precio EXCLUSIVO (contado, transferencia
--    y débito) y `precio_lista` es el que usa Financiamiento. Cada uno se carga
--    por separado; si precio_lista está vacío se usa `precio`.
alter table productos_maestro add column if not exists precio_lista numeric;
alter table productos add column if not exists precio_lista numeric;
alter table dispositivos add column if not exists precio_lista numeric;

-- 3) CRÉDITOS FUERA DE LA GUÍA: cada vez que se carga un crédito con más cuotas
--    que las permitidas para el producto, queda acá el motivo (no bloquea la venta).
create table if not exists creditos_fuera_guia (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  orden_id uuid references ordenes(id) on delete set null,
  plan_id uuid references financiacion_planes(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null,
  vendedor_id uuid references vendedores(id) on delete set null,
  vendedor_nombre text,
  productos text,                 -- descripción de lo vendido (texto, no se rompe si se borra el producto)
  cuotas integer not null,        -- cuotas que se pusieron
  maximo integer not null,        -- máximo que permitía la guía (0 = sin financiación)
  motivo text not null,
  sucursal_id uuid references sucursales(id) on delete set null,
  registrado_por_nombre text,
  created_at timestamptz not null default now(),
  constraint creditos_fuera_guia_motivo_no_vacio check (length(trim(motivo)) > 0)
);
create index if not exists idx_creditos_fuera_guia_negocio on creditos_fuera_guia(negocio_id, created_at desc);

alter table creditos_fuera_guia enable row level security;
drop policy if exists "creditos_fuera_guia de mi negocio" on creditos_fuera_guia;
create policy "creditos_fuera_guia de mi negocio" on creditos_fuera_guia
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- 4) LOCALIDADES: lista cerrada por negocio para que no se escriba distinto cada
--    vez (el cliente guarda el NOMBRE en clientes.localidad, que ya existe).
create table if not exists localidades (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint localidades_nombre_no_vacio check (length(trim(nombre)) > 0)
);
create unique index if not exists uq_localidades_nombre on localidades(negocio_id, lower(nombre));

alter table localidades enable row level security;
drop policy if exists "localidades de mi negocio" on localidades;
create policy "localidades de mi negocio" on localidades
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- 5) SUCURSAL DE ORIGEN del cliente: la sucursal que lo dio de alta / le dio el
--    primer crédito. La cartera de clientes sigue siendo ÚNICA y compartida.
alter table clientes add column if not exists sucursal_origen_id uuid references sucursales(id) on delete set null;
create index if not exists idx_clientes_sucursal_origen on clientes(negocio_id, sucursal_origen_id);
create index if not exists idx_clientes_localidad on clientes(negocio_id, localidad);
create index if not exists idx_clientes_dni on clientes(negocio_id, dni) where dni is not null;
