-- ============================================================
-- QOVENTO — Módulo de CATEGORÍAS editables de Stock + modalidades de
-- control (serializado / por cantidad).
-- Migración ADITIVA e IDEMPOTENTE (todo if not exists / or replace).
-- Correr en Supabase SQL Editor. NO borra ni altera dispositivos ni
-- productos existentes — el backfill de abajo solo LLENA categoria_id
-- donde está vacío, nunca pisa un valor ya cargado, y se puede correr más
-- de una vez sin duplicar categorías ni relaciones.
-- ============================================================

-- ============================================================
-- CATEGORÍAS (pertenecen exclusivamente al negocio que las creó)
-- ============================================================
create table if not exists stock_categorias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  orden int not null default 0,
  activa boolean not null default true,
  archivada boolean not null default false,
  perfil_default text not null default 'generico',      -- 'dispositivo' | 'generico'
  modalidad_default text not null default 'cantidad',    -- 'serializado' | 'cantidad'
  icono text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_categorias_nombre_no_vacio check (length(trim(nombre)) > 0)
);
-- Nombre único por negocio ENTRE LAS ACTIVAS (una archivada no bloquea
-- crear una nueva con el mismo nombre — igual se puede restaurar la vieja
-- en vez de crear una nueva, eso lo decide quien la administra).
create unique index if not exists uq_stock_categorias_nombre_activa
  on stock_categorias(negocio_id, lower(nombre)) where not archivada;
create index if not exists idx_stock_categorias_negocio on stock_categorias(negocio_id, orden);

alter table stock_categorias enable row level security;
drop policy if exists "stock_categorias de mi negocio" on stock_categorias;
create policy "stock_categorias de mi negocio" on stock_categorias
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ============================================================
-- Vínculo con dispositivos (celulares) — nullable, no rompe nada.
-- ============================================================
alter table dispositivos add column if not exists categoria_id uuid references stock_categorias(id) on delete set null;
create index if not exists idx_dispositivos_categoria on dispositivos(categoria_id);

-- ============================================================
-- Extensión de productos: categoría + modalidad + los campos del "perfil
-- genérico" que hoy no existen (marca, SKU, código de barras, número de
-- serie opcional, proveedor, stock mínimo, garantía, notas). Todo nullable
-- o con default seguro — ninguna fila existente pierde nada.
-- ============================================================
alter table productos add column if not exists categoria_id uuid references stock_categorias(id) on delete set null;
alter table productos add column if not exists modalidad text not null default 'cantidad';  -- 'serializado' | 'cantidad'
alter table productos add column if not exists marca text;
alter table productos add column if not exists sku text;
alter table productos add column if not exists codigo_barras text;
alter table productos add column if not exists numero_serie text;
alter table productos add column if not exists proveedor_id uuid references proveedores(id) on delete set null;
alter table productos add column if not exists stock_minimo int;
alter table productos add column if not exists garantia_dias int;
alter table productos add column if not exists descripcion text;
alter table productos add column if not exists notas text;
create index if not exists idx_productos_categoria on productos(categoria_id);

-- ============================================================
-- BACKFILL idempotente: categoría "Celulares" para dispositivos existentes,
-- "Accesorios" para productos existentes — SOLO si ese negocio ya tiene
-- filas de ese tipo y todavía no tiene una categoría con ese nombre exacto.
-- Se puede correr las veces que haga falta: la 2ª vez no encuentra
-- dispositivos/productos con categoria_id null, así que no hace nada.
-- ============================================================
do $$
declare
  v_negocio record;
  v_cat_id uuid;
begin
  for v_negocio in select distinct negocio_id from dispositivos where categoria_id is null
  loop
    select id into v_cat_id from stock_categorias where negocio_id = v_negocio.negocio_id and lower(nombre) = 'celulares' and not archivada limit 1;
    if v_cat_id is null then
      insert into stock_categorias (negocio_id, nombre, orden, perfil_default, modalidad_default)
      values (v_negocio.negocio_id, 'Celulares', 0, 'dispositivo', 'serializado')
      returning id into v_cat_id;
    end if;
    update dispositivos set categoria_id = v_cat_id where negocio_id = v_negocio.negocio_id and categoria_id is null;
  end loop;

  for v_negocio in select distinct negocio_id from productos where categoria_id is null
  loop
    select id into v_cat_id from stock_categorias where negocio_id = v_negocio.negocio_id and lower(nombre) = 'accesorios' and not archivada limit 1;
    if v_cat_id is null then
      insert into stock_categorias (negocio_id, nombre, orden, perfil_default, modalidad_default)
      values (v_negocio.negocio_id, 'Accesorios', 1, 'generico', 'cantidad')
      returning id into v_cat_id;
    end if;
    update productos set categoria_id = v_cat_id where negocio_id = v_negocio.negocio_id and categoria_id is null;
  end loop;
end $$;

-- ============================================================
-- Movimientos de stock "por cantidad" — historial + responsable, igual que
-- pide la spec (entradas, salidas, ventas, devoluciones, ajustes).
-- ============================================================
create table if not exists producto_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  producto_id uuid not null references productos(id) on delete cascade,
  tipo text not null,              -- entrada | salida | venta | devolucion | ajuste
  cantidad int not null,           -- siempre positivo; el signo lo da el tipo (ver la función de abajo)
  cantidad_resultante int not null, -- cantidad del producto DESPUÉS de este movimiento (foto para auditar)
  motivo text,
  usuario text,
  orden_id uuid references ordenes(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint producto_movimientos_cantidad_positiva check (cantidad > 0)
);
create index if not exists idx_producto_movimientos_negocio on producto_movimientos(negocio_id);
create index if not exists idx_producto_movimientos_producto on producto_movimientos(producto_id, created_at desc);

alter table producto_movimientos enable row level security;
drop policy if exists "producto_movimientos de mi negocio" on producto_movimientos;
create policy "producto_movimientos de mi negocio" on producto_movimientos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ============================================================
-- RPC atómico: mueve stock de un producto "por cantidad", nunca lo deja
-- negativo, deja rastro en producto_movimientos. Mismo patrón que
-- repuesto_consumir (Servicio Técnico): select ... for update serializa
-- movimientos simultáneos del MISMO producto en vez del lee-modifica-
-- escribe que tenía el editor manual hasta ahora (condición de carrera real).
-- tipo: 'entrada' | 'devolucion' suman; 'salida' | 'venta' | 'ajuste' restan
-- (para "ajuste" que suma, se resuelve con signo: p_cantidad puede venir
-- negativo desde la app para un ajuste hacia arriba).
-- ============================================================
create or replace function producto_mover_stock(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad int,     -- siempre positivo, salvo tipo='ajuste' que puede ser negativo (ajuste hacia arriba)
  p_motivo text,
  p_usuario text,
  p_orden_id uuid default null
) returns int language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_actual int;
  v_delta int;
  v_nueva int;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_tipo not in ('entrada', 'salida', 'venta', 'devolucion', 'ajuste') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;

  select cantidad into v_actual from productos where id = p_producto_id and negocio_id = v_negocio for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  v_delta := case
    when p_tipo in ('entrada', 'devolucion') then abs(p_cantidad)
    when p_tipo in ('salida', 'venta') then -abs(p_cantidad)
    else p_cantidad -- 'ajuste': el signo lo decide quien llama
  end;
  v_nueva := v_actual + v_delta;
  if v_nueva < 0 then
    raise exception 'Stock insuficiente: quedan % y se intentó descontar %', v_actual, abs(v_delta);
  end if;

  update productos set cantidad = v_nueva where id = p_producto_id;

  insert into producto_movimientos (negocio_id, producto_id, tipo, cantidad, cantidad_resultante, motivo, usuario, orden_id)
  values (v_negocio, p_producto_id, p_tipo, abs(v_delta), v_nueva, p_motivo, p_usuario, p_orden_id);

  return v_nueva;
end $$;

grant execute on function producto_mover_stock(uuid, text, int, text, text, uuid) to authenticated;
