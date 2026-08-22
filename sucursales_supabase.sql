-- ============================================================
-- QOVENTO — Módulo de SUCURSALES (multisucursal).
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. NO borra ni altera nada existente, y un
-- negocio que nunca activa sucursales no nota ningún cambio: todas las
-- columnas nuevas son opcionales (nullable) y el flag arranca apagado.
--
-- Fase 1 (alcance de esta migración): modelo de datos completo + activación
-- desde Configuración + asignar sucursal a Vendedores/Técnicos + Stock
-- (dispositivos y productos) etiquetado y filtrable por sucursal.
-- Ventas/Caja, Servicio Técnico, Egresos y Estadísticas por sucursal quedan
-- para fases siguientes — sus columnas ya se agregan acá (para no tener que
-- volver a tocar el schema), pero la app todavía no las usa.
-- ============================================================

-- ============================================================
-- Config del negocio: apagado por defecto, como comisiones_activas.
-- ============================================================
alter table negocios add column if not exists multisucursal_activo boolean not null default false;

-- ============================================================
-- SUCURSALES (pertenecen exclusivamente al negocio que las creó)
-- ============================================================
create table if not exists sucursales (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  activa boolean not null default true,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sucursales_nombre_no_vacio check (length(trim(nombre)) > 0)
);
-- Nombre único por negocio entre las activas — mismo criterio que
-- stock_categorias (una archivada no bloquea crear una nueva con el mismo
-- nombre).
create unique index if not exists uq_sucursales_nombre_activa
  on sucursales(negocio_id, lower(nombre)) where not archivada;
create index if not exists idx_sucursales_negocio on sucursales(negocio_id);

alter table sucursales enable row level security;
drop policy if exists "sucursales de mi negocio" on sucursales;
create policy "sucursales de mi negocio" on sucursales
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ============================================================
-- sucursal_id — nullable en todas las tablas operativas relevantes. No hay
-- función sucursal_actual() a nivel Postgres (a diferencia de negocio_id,
-- ninguna sesión de Supabase Auth sabe "en qué sucursal está" — eso lo
-- decide el navegador, igual que ya pasa con qué vendedor/técnico está
-- actuando). La app manda sucursal_id explícito en cada insert, igual que
-- ya hace con categoria_id.
--
-- orden_items NO recibe columna propia: hereda la sucursal de su orden
-- padre, mismo criterio que ya usa para negocio_id (no tiene columna
-- propia, se resuelve vía join a ordenes).
-- ============================================================
alter table dispositivos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
create index if not exists idx_dispositivos_sucursal on dispositivos(sucursal_id);

alter table productos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
create index if not exists idx_productos_sucursal on productos(sucursal_id);

alter table vendedores add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
alter table tecnicos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;

alter table ordenes add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
create index if not exists idx_ordenes_sucursal on ordenes(sucursal_id);

alter table reparaciones add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
create index if not exists idx_reparaciones_sucursal on reparaciones(sucursal_id);

alter table egresos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;

alter table pagos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;

alter table cta_cte_movimientos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;

-- ============================================================
-- RPC de activación: crea (si hace falta) la sucursal por defecto de este
-- negocio y vuelca ahí todo lo que hoy no tiene sucursal asignada — un solo
-- viaje atómico en vez de que la pantalla haga N updates sueltos desde el
-- cliente. Idempotente: correrla de nuevo no crea una segunda "Sucursal
-- principal" ni pisa un sucursal_id ya asignado a mano.
-- ============================================================
create or replace function activar_multisucursal(p_nombre_principal text default 'Sucursal principal')
returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_sucursal_id uuid;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  select id into v_sucursal_id from sucursales
    where negocio_id = v_negocio and not archivada
    order by created_at asc limit 1;

  if v_sucursal_id is null then
    insert into sucursales (negocio_id, nombre)
    values (v_negocio, p_nombre_principal)
    returning id into v_sucursal_id;
  end if;

  update dispositivos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update productos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update vendedores set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update tecnicos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update ordenes set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update reparaciones set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update egresos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update pagos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update cta_cte_movimientos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;

  update negocios set multisucursal_activo = true where id = v_negocio;

  return v_sucursal_id;
end $$;

grant execute on function activar_multisucursal(text) to authenticated;
