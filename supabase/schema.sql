-- ============================================================
-- Esquema de Qovento
-- Pegar este archivo completo en Supabase: SQL Editor > New query > Run
-- ============================================================

-- Un "negocio" es cada local/empresa que usa la app.
create table negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text,
  texto_garantia text,
  created_at timestamptz default now()
);

-- Cada usuario que se registra queda vinculado a un negocio.
-- (perfiles.id = mismo id que auth.users, así Supabase los conecta solo)
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  negocio_id uuid not null references negocios(id) on delete cascade,
  rol text not null default 'admin',
  created_at timestamptz default now()
);

create table dispositivos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  modelo text,
  capacidad_gb int,
  imei text,
  numero_serie text,
  salud_bateria int,
  color text,
  precio numeric,
  estado text,
  codigo_interno text,
  garantia text,
  en_stock boolean not null default true,
  created_at timestamptz default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  apellido text,
  domicilio text,
  email text,
  telefono text,
  dni text,
  created_at timestamptz default now()
);

create table ordenes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_id uuid references clientes(id),
  dispositivo_id uuid references dispositivos(id),
  forma_pago text,
  total numeric,
  canje jsonb, -- datos del dispositivo entregado como parte de pago, si aplica
  estado text not null default 'pendiente', -- pendiente | pagado | entregado
  created_at timestamptz default now()
);

-- ============================================================
-- Función auxiliar: a qué negocio pertenece el usuario logueado
-- ============================================================
create or replace function negocio_actual()
returns uuid
language sql
security definer
stable
as $$
  select negocio_id from perfiles where id = auth.uid()
$$;

-- ============================================================
-- Seguridad: cada negocio solo ve sus propios datos
-- ============================================================
alter table negocios enable row level security;
alter table perfiles enable row level security;
alter table dispositivos enable row level security;
alter table clientes enable row level security;
alter table ordenes enable row level security;

create policy "ver mi negocio" on negocios
  for select using (id = negocio_actual());
create policy "actualizar mi negocio" on negocios
  for update using (id = negocio_actual());
create policy "crear negocio al registrarse" on negocios
  for insert with check (auth.uid() is not null);

create policy "ver mi perfil" on perfiles
  for select using (id = auth.uid());
create policy "crear mi perfil al registrarse" on perfiles
  for insert with check (id = auth.uid());

create policy "dispositivos de mi negocio" on dispositivos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "clientes de mi negocio" on clientes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "ordenes de mi negocio" on ordenes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Función para crear el negocio + perfil juntos al registrarse.
-- Evita el problema de "orden": la política para VER un negocio
-- necesita que el perfil ya exista, pero el perfil se crea recién
-- después de crear el negocio. Esta función hace las dos cosas
-- en un solo paso interno, sin pasar por esa restricción.
-- ============================================================
create or replace function crear_negocio_y_perfil(nombre_negocio text)
returns uuid
language plpgsql
security definer
as $$
declare
  nuevo_negocio_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from perfiles where id = auth.uid()) then
    raise exception 'Ya tenés un negocio configurado';
  end if;

  insert into negocios (nombre) values (nombre_negocio) returning id into nuevo_negocio_id;
  insert into perfiles (id, negocio_id) values (auth.uid(), nuevo_negocio_id);

  return nuevo_negocio_id;
end;
$$;

-- ============================================================
-- Los inserts desde el navegador completan negocio_id solos,
-- tomando el negocio del usuario logueado. Así no hace falta
-- mandarlo a mano desde el código y no hay forma de mandar
-- uno equivocado (la política RLS lo sigue verificando igual).
-- ============================================================
alter table dispositivos alter column negocio_id set default negocio_actual();
alter table clientes alter column negocio_id set default negocio_actual();
alter table ordenes alter column negocio_id set default negocio_actual();

-- ============================================================
-- Ajustes al cargar el módulo de Stock: código interno y n° de
-- serie no se cargan a mano, y la garantía es un texto por
-- negocio (negocios.texto_garantia) que va en la boleta, no un
-- dato por dispositivo.
-- ============================================================
alter table dispositivos drop column if exists codigo_interno;
alter table dispositivos drop column if exists garantia;

-- ============================================================
-- Órdenes con carrito: vendedores, catálogo de productos/
-- accesorios (cada negocio arma el suyo), e ítems de la orden
-- (antes una orden apuntaba a un solo dispositivo; ahora puede
-- tener varias líneas, sean dispositivos, productos del catálogo
-- o ítems cargados a mano).
-- ============================================================
alter table negocios add column if not exists telefono text;
alter table negocios add column if not exists direccion text;

create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  precio numeric,
  created_at timestamptz default now()
);

alter table ordenes add column if not exists vendedor_id uuid references vendedores(id);
alter table ordenes add column if not exists anticipo numeric default 0;
alter table ordenes add column if not exists impuesto_porcentaje numeric default 0;
alter table ordenes add column if not exists fecha_entrega timestamptz;

create table if not exists orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id) on delete cascade,
  dispositivo_id uuid references dispositivos(id),
  descripcion text not null,
  cantidad int not null default 1,
  precio_unitario numeric not null default 0,
  created_at timestamptz default now()
);

alter table vendedores enable row level security;
alter table productos enable row level security;
alter table orden_items enable row level security;

create policy "vendedores de mi negocio" on vendedores
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "productos de mi negocio" on productos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "items de ordenes de mi negocio" on orden_items
  for all using (orden_id in (select id from ordenes where negocio_id = negocio_actual()))
  with check (orden_id in (select id from ordenes where negocio_id = negocio_actual()));

-- ============================================================
-- Plan canje: el dispositivo que el cliente entrega como parte
-- de pago NO entra directo al stock (puede tener detalles/fallas
-- que haya que revisar primero). Tiene su propia sección, y desde
-- ahí se puede derivar a Servicio Técnico.
-- ============================================================
alter table ordenes add column if not exists monto_canje numeric default 0;
alter table ordenes drop column if exists canje;
alter table ordenes drop column if exists dispositivo_canje_id;

create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists canjes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  orden_id uuid references ordenes(id) on delete set null,
  modelo text,
  capacidad_gb int,
  color text,
  salud_bateria int,
  detalles text,
  monto numeric,
  vendedor_id uuid references vendedores(id),
  tecnico_id uuid references tecnicos(id),
  estado text not null default 'en_canje', -- en_canje | servicio_tecnico
  created_at timestamptz default now()
);

alter table ordenes add column if not exists canje_id uuid references canjes(id);

alter table tecnicos enable row level security;
alter table canjes enable row level security;

create policy "tecnicos de mi negocio" on tecnicos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "canjes de mi negocio" on canjes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Servicio Técnico: catálogo de arreglos (mismo concepto que
-- productos, pero para trabajos de reparación), marcar equipos de
-- Plan Canje como reparados, y poder facturar un arreglo a un
-- cliente como ítem de una orden común (con su propia garantía,
-- distinta a la de los productos).
-- ============================================================
create table if not exists trabajos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  precio numeric,
  created_at timestamptz default now()
);

alter table trabajos enable row level security;
create policy "trabajos de mi negocio" on trabajos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

alter table canjes add column if not exists trabajos_realizados text[];

alter table orden_items add column if not exists tipo text not null default 'producto';

alter table negocios add column if not exists texto_garantia_servicio text;
