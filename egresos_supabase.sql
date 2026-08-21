-- ============================================================
-- QOVENTO — Módulo de EGRESOS operativos
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. No toca ninguna tabla existente.
--
-- Alcance a propósito ACOTADO: este módulo es para gasto operativo, retiro
-- de dinero, ajuste u "otro egreso" — NO para compra de mercadería (eso ya
-- se registra en `compras_proveedor`/compras manuales) ni para pago a
-- proveedor (eso ya se registra en `proveedor_movimientos`, cuentas por
-- pagar). Mezclar esos conceptos acá duplicaría la misma plata dos veces —
-- por eso el check de `tipo` de abajo ni siquiera admite esos dos valores.
-- ============================================================

-- ============================================================
-- CATEGORÍAS de egresos (editables, pertenecen exclusivamente al negocio
-- que las creó) — mismo patrón que stock_categorias.
-- ============================================================
create table if not exists egresos_categorias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  orden int not null default 0,
  activa boolean not null default true,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint egresos_categorias_nombre_no_vacio check (length(trim(nombre)) > 0)
);
create unique index if not exists uq_egresos_categorias_nombre_activa
  on egresos_categorias(negocio_id, lower(nombre)) where not archivada;
create index if not exists idx_egresos_categorias_negocio on egresos_categorias(negocio_id, orden);

alter table egresos_categorias enable row level security;
drop policy if exists "egresos_categorias de mi negocio" on egresos_categorias;
create policy "egresos_categorias de mi negocio" on egresos_categorias
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- Categorías de arranque, una sola vez por negocio (si ya tiene alguna
-- categoría de egresos cargada —propia o de una corrida anterior de este
-- mismo script—, no inserta nada; se puede correr más de una vez sin
-- duplicar). Son etiquetas sugeridas, no datos financieros — no se garantiza
-- que reflejen los gastos reales de cada negocio, el dueño las edita/borra
-- libremente después.
do $$
declare
  v_negocio record;
begin
  for v_negocio in select id from negocios
  loop
    if not exists (select 1 from egresos_categorias where negocio_id = v_negocio.id) then
      insert into egresos_categorias (negocio_id, nombre, orden) values
        (v_negocio.id, 'Alquiler', 0),
        (v_negocio.id, 'Servicios (luz, internet, etc.)', 1),
        (v_negocio.id, 'Sueldos', 2),
        (v_negocio.id, 'Impuestos', 3),
        (v_negocio.id, 'Otros', 4);
    end if;
  end loop;
end $$;

-- ============================================================
-- EGRESOS — gasto operativo, retiro de dinero, ajuste u otro egreso.
-- Explícitamente NO admite 'compra' ni 'pago_proveedor' como tipo (ver
-- comentario de arriba) — esos movimientos ya existen en otras tablas.
-- ============================================================
create table if not exists egresos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  fecha date not null default current_date,
  categoria_id uuid references egresos_categorias(id) on delete set null,
  tipo text not null default 'gasto_operativo',  -- gasto_operativo | retiro | ajuste | otro
  descripcion text not null,
  importe numeric not null,
  moneda text not null default 'ARS',
  medio_pago text,                                -- efectivo | transferencia | debito | credito (opcional)
  proveedor_id uuid references proveedores(id) on delete set null,  -- opcional (ej. un gasto puntual con un proveedor sin ser "compra")
  notas text,
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint egresos_importe_positivo check (importe > 0),
  constraint egresos_descripcion_no_vacia check (length(trim(descripcion)) > 0),
  constraint egresos_tipo_valido check (tipo in ('gasto_operativo', 'retiro', 'ajuste', 'otro'))
);
create index if not exists idx_egresos_negocio on egresos(negocio_id, fecha desc) where not anulado;
create index if not exists idx_egresos_categoria on egresos(categoria_id);

alter table egresos enable row level security;
drop policy if exists "egresos de mi negocio" on egresos;
create policy "egresos de mi negocio" on egresos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ============================================================
-- Permiso: ver y gestionar egresos queda como 'ver_proveedores'/
-- 'gestionar_comisiones' — solo accesoCompleto o administrador (no es un
-- permiso granular por vendedor: retiros y ajustes son información sensible
-- de la operación del negocio, no una tarea del día a día de un empleado).
-- No requiere columna nueva en vendedores/tecnicos — se resuelve en
-- app/lib/permisos.ts.
-- ============================================================
