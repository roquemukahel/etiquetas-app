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
