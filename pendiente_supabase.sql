-- ============================================================
-- QOVENTO — SQL pendiente (versión chica y segura)
--
-- Correr TODO esto en Supabase > SQL Editor > Run.
-- Es seguro correrlo las veces que quieras: todo está protegido con
-- "if not exists" / "or replace", y las políticas se recrean con un
-- "drop if exists" antes. No borra ni duplica datos.
--
-- Cubre lo que faltaba para: rol Administrador, permisos por vendedor/
-- técnico, PIN al cambiar de cuenta, Proveedores, y el color de las
-- compras a proveedores.
-- ============================================================


-- ---------- 1) Permisos de VENDEDORES ----------
alter table vendedores add column if not exists acceso_completo boolean not null default true;
alter table vendedores add column if not exists puede_vender boolean not null default true;
alter table vendedores add column if not exists puede_eliminar boolean not null default true;
alter table vendedores add column if not exists puede_agregar_stock boolean not null default true;
alter table vendedores add column if not exists puede_ver_estadisticas boolean not null default true;
alter table vendedores add column if not exists puede_recibir_servicio_tecnico boolean not null default true;
alter table vendedores add column if not exists puede_gestionar_servicio_tecnico boolean not null default true;
alter table vendedores add column if not exists es_administrador boolean not null default true;

-- ---------- 2) Permisos de TÉCNICOS (las mismas columnas) ----------
alter table tecnicos add column if not exists acceso_completo boolean not null default true;
alter table tecnicos add column if not exists puede_vender boolean not null default true;
alter table tecnicos add column if not exists puede_eliminar boolean not null default true;
alter table tecnicos add column if not exists puede_agregar_stock boolean not null default true;
alter table tecnicos add column if not exists puede_ver_estadisticas boolean not null default true;
alter table tecnicos add column if not exists puede_recibir_servicio_tecnico boolean not null default true;
alter table tecnicos add column if not exists puede_gestionar_servicio_tecnico boolean not null default true;
alter table tecnicos add column if not exists es_administrador boolean not null default true;


-- ---------- 3) PIN (columna + funciones que lo verifican sin exponerlo) ----------
alter table vendedores add column if not exists pin text;
alter table tecnicos add column if not exists pin text;

create or replace function ids_vendedores_con_pin()
returns table (id uuid)
language sql
security definer
stable
as $$
  select id from vendedores where negocio_id = negocio_actual() and pin is not null
$$;

create or replace function ids_tecnicos_con_pin()
returns table (id uuid)
language sql
security definer
stable
as $$
  select id from tecnicos where negocio_id = negocio_actual() and pin is not null
$$;

create or replace function verificar_pin_vendedor(vendedor_id uuid, pin_ingresado text)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from vendedores
    where id = vendedor_id and negocio_id = negocio_actual() and pin is not null and pin = pin_ingresado
  )
$$;

create or replace function verificar_pin_tecnico(tecnico_id uuid, pin_ingresado text)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from tecnicos
    where id = tecnico_id and negocio_id = negocio_actual() and pin is not null and pin = pin_ingresado
  )
$$;


-- ---------- 4) Proveedores ----------
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  telefono text,
  detalles text,
  created_at timestamptz default now()
);

alter table proveedores enable row level security;

drop policy if exists "proveedores de mi negocio" on proveedores;
create policy "proveedores de mi negocio" on proveedores
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

alter table dispositivos add column if not exists proveedor_id uuid references proveedores(id) on delete set null;
alter table dispositivos add column if not exists costo numeric;

-- Migración del campo viejo de texto (dispositivos.proveedor) a proveedores
-- reales. No toca ni borra el texto viejo, y no duplica si ya se corrió.
insert into proveedores (negocio_id, nombre)
select d.negocio_id, min(d.proveedor)
from dispositivos d
where d.proveedor is not null and trim(d.proveedor) <> ''
  and not exists (
    select 1 from proveedores p
    where p.negocio_id = d.negocio_id and lower(p.nombre) = lower(trim(d.proveedor))
  )
group by d.negocio_id, lower(trim(d.proveedor));

update dispositivos d
set proveedor_id = p.id
from proveedores p
where d.proveedor_id is null
  and d.proveedor is not null and trim(d.proveedor) <> ''
  and p.negocio_id = d.negocio_id
  and lower(p.nombre) = lower(trim(d.proveedor));


-- ---------- 5) Compras a proveedores (con color) ----------
create table if not exists compras_proveedor (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  modelo text,
  capacidad_gb int,
  color text,
  cantidad int not null default 1,
  precio_unitario numeric,
  detalles text,
  created_at timestamptz default now()
);

-- Por si la tabla ya existía de antes sin la columna color.
alter table compras_proveedor add column if not exists color text;

alter table compras_proveedor enable row level security;

drop policy if exists "compras_proveedor de mi negocio" on compras_proveedor;
create policy "compras_proveedor de mi negocio" on compras_proveedor
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());
