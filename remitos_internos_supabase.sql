-- ============================================================
-- QOVENTO — Remito Interno: mover stock de productos entre sucursales,
-- con comprobante numerado. Migración ADITIVA e IDEMPOTENTE. Requiere
-- haber corrido antes productos_maestro_supabase.sql (usa
-- producto_maestro_id) y sucursales_supabase.sql (usa `sucursales`).
--
-- Numeración: mismo patrón ya usado para reparaciones.numero_orden
-- (contador en `negocios` + función que lo incrementa atómicamente +
-- trigger before insert), prefijo "RI-" en vez de "ST-".
-- ============================================================

alter table negocios add column if not exists contador_remitos int not null default 0;

create or replace function siguiente_numero_remito(neg_id uuid)
returns text language plpgsql as $$
declare
  nuevo_numero int;
begin
  update negocios
  set contador_remitos = contador_remitos + 1
  where id = neg_id
  returning contador_remitos into nuevo_numero;

  return 'RI-' || lpad(nuevo_numero::text, 6, '0');
end;
$$;

create table if not exists remitos_internos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  numero text,
  sucursal_origen_id uuid not null references sucursales(id),
  sucursal_destino_id uuid not null references sucursales(id),
  fecha timestamptz not null default now(),
  observaciones text,
  usuario text,
  created_at timestamptz not null default now(),
  constraint remitos_internos_origen_destino_distintos check (sucursal_origen_id <> sucursal_destino_id)
);
create unique index if not exists remitos_internos_numero_idx on remitos_internos(negocio_id, numero);
create index if not exists idx_remitos_internos_negocio on remitos_internos(negocio_id, created_at desc);

create or replace function asignar_numero_remito()
returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := siguiente_numero_remito(new.negocio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_numero_remito on remitos_internos;
create trigger trigger_numero_remito
  before insert on remitos_internos
  for each row
  execute function asignar_numero_remito();

alter table remitos_internos enable row level security;
drop policy if exists "remitos_internos de mi negocio" on remitos_internos;
create policy "remitos_internos de mi negocio" on remitos_internos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- Ítems: snapshot de nombre/marca al momento del remito (mismo criterio que
-- orden_items, que guarda descripcion/precio_unitario como copia además de
-- la referencia) — así el remito histórico no cambia si después alguien
-- edita el catálogo. `producto_origen_id` referencia la fila puntual de
-- `productos` que originó el movimiento (la de la sucursal origen).
-- `tipo_item` + `dispositivo_origen_id`: un remito también puede mover
-- celulares (tabla `dispositivos`, no `productos`) — cada ítem es de un
-- tipo o del otro, nunca los dos a la vez (ver el check de abajo).
create table if not exists remito_internos_items (
  id uuid primary key default gen_random_uuid(),
  remito_id uuid not null references remitos_internos(id) on delete cascade,
  tipo_item text not null default 'producto',
  producto_maestro_id uuid references productos_maestro(id) on delete set null,
  producto_origen_id uuid references productos(id) on delete set null,
  dispositivo_origen_id uuid references dispositivos(id) on delete set null,
  nombre_snapshot text not null,
  marca_snapshot text,
  cantidad int not null check (cantidad > 0),
  constraint remito_internos_items_tipo_valido check (tipo_item in ('producto', 'dispositivo')),
  constraint remito_internos_items_origen_coherente check (
    (tipo_item = 'producto' and dispositivo_origen_id is null) or
    (tipo_item = 'dispositivo' and producto_origen_id is null and producto_maestro_id is null)
  )
);
alter table remito_internos_items add column if not exists tipo_item text not null default 'producto';
alter table remito_internos_items add column if not exists dispositivo_origen_id uuid references dispositivos(id) on delete set null;
alter table remito_internos_items drop constraint if exists remito_internos_items_tipo_valido;
alter table remito_internos_items add constraint remito_internos_items_tipo_valido check (tipo_item in ('producto', 'dispositivo'));
alter table remito_internos_items drop constraint if exists remito_internos_items_origen_coherente;
alter table remito_internos_items add constraint remito_internos_items_origen_coherente check (
  (tipo_item = 'producto' and dispositivo_origen_id is null) or
  (tipo_item = 'dispositivo' and producto_origen_id is null and producto_maestro_id is null)
);
create index if not exists idx_remito_internos_items_remito on remito_internos_items(remito_id);

alter table remito_internos_items enable row level security;
drop policy if exists "remito_internos_items de mi negocio" on remito_internos_items;
create policy "remito_internos_items de mi negocio" on remito_internos_items
  for all using (
    exists (select 1 from remitos_internos r where r.id = remito_id and r.negocio_id = negocio_actual())
  ) with check (
    exists (select 1 from remitos_internos r where r.id = remito_id and r.negocio_id = negocio_actual())
  );

-- ============================================================
-- RPC transaccional: crea el remito y mueve el stock de todos los ítems.
-- p_items es un jsonb array de {tipo, id, cantidad} — tipo es 'producto'
-- (default si se omite, por compatibilidad con la versión anterior) o
-- 'dispositivo'; "id" es SIEMPRE la fila puntual en la sucursal ORIGEN.
--
-- Por cada ítem tipo 'producto':
--  - "cantidad" (modalidad != 'serializado'): descuenta del origen con
--    producto_mover_stock('salida', ...) (RPC ya existente, sin tocar),
--    busca en destino una fila con el mismo producto_maestro_id — si
--    existe, le suma con producto_mover_stock('entrada', ...); si no
--    existe, crea una fila nueva en `productos` para esa sucursal
--    clonando los datos descriptivos del maestro.
--  - "serializado" (equipo con número de serie propio, cantidad=1): NO se
--    llama a producto_mover_stock — es la unidad física moviéndose, así
--    que simplemente se le cambia sucursal_id a la MISMA fila, sin crear
--    ni descontar/acreditar cantidad.
--
-- Por cada ítem tipo 'dispositivo' (celular): igual criterio que un
-- producto serializado — cantidad siempre 1, se le cambia sucursal_id a
-- la MISMA fila de `dispositivos` (misma unidad física, mismo IMEI,
-- mismo historial), nunca se crea una fila nueva.
--
-- Es una sola función plpgsql: si cualquier paso falla (ej. "Stock
-- insuficiente" que ya lanza producto_mover_stock), Postgres revierte todo
-- el remito solo — no puede quedar un estado a mitad de camino.
-- ============================================================
create or replace function crear_remito_interno(
  p_sucursal_origen_id uuid,
  p_sucursal_destino_id uuid,
  p_items jsonb,   -- [{tipo: 'producto'|'dispositivo', id, cantidad}, ...]
  p_observaciones text,
  p_usuario text
) returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_remito_id uuid;
  v_item jsonb;
  v_tipo text;
  v_id uuid;
  v_cantidad int;
  v_origen record;
  v_disp record;
  v_destino_id uuid;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;
  if p_sucursal_origen_id = p_sucursal_destino_id then
    raise exception 'La sucursal de origen y destino no pueden ser la misma';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El remito necesita al menos un ítem';
  end if;

  insert into remitos_internos (negocio_id, sucursal_origen_id, sucursal_destino_id, observaciones, usuario)
  values (v_negocio, p_sucursal_origen_id, p_sucursal_destino_id, p_observaciones, p_usuario)
  returning id into v_remito_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tipo := coalesce(v_item->>'tipo', 'producto');
    v_id := coalesce((v_item->>'id')::uuid, (v_item->>'producto_id')::uuid);
    v_cantidad := (v_item->>'cantidad')::int;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida para el ítem %', v_id;
    end if;

    if v_tipo = 'dispositivo' then
      if v_cantidad <> 1 then
        raise exception 'Un dispositivo se transfiere de a 1 unidad';
      end if;
      select id, modelo into v_disp
        from dispositivos
        where id = v_id and negocio_id = v_negocio and sucursal_id = p_sucursal_origen_id and en_stock = true
        for update;
      if not found then
        raise exception 'Dispositivo % no encontrado en la sucursal de origen', v_id;
      end if;
      update dispositivos set sucursal_id = p_sucursal_destino_id where id = v_disp.id;

      insert into remito_internos_items (remito_id, tipo_item, dispositivo_origen_id, nombre_snapshot, marca_snapshot, cantidad)
      values (v_remito_id, 'dispositivo', v_disp.id, coalesce(v_disp.modelo, 'Sin modelo'), null, 1);
      continue;
    end if;

    select id, nombre, marca, modalidad, producto_maestro_id, categoria_id, precio, costo, sku, codigo_barras,
           descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url
      into v_origen
      from productos
      where id = v_id and negocio_id = v_negocio and sucursal_id = p_sucursal_origen_id
      for update;
    if not found then
      raise exception 'Producto % no encontrado en la sucursal de origen', v_id;
    end if;

    if v_origen.modalidad = 'serializado' then
      if v_cantidad <> 1 then
        raise exception 'Un producto serializado se transfiere de a 1 unidad';
      end if;
      update productos set sucursal_id = p_sucursal_destino_id where id = v_origen.id;
    else
      perform producto_mover_stock(v_origen.id, 'salida', v_cantidad, 'Remito interno', p_usuario, null);

      v_destino_id := null;
      if v_origen.producto_maestro_id is not null then
        -- Lockea el maestro ANTES de buscar la fila destino: "select ... for
        -- update" no bloquea nada cuando todavía no existe ninguna fila que
        -- coincida (no hay qué lockear), así que sin esto dos remitos
        -- concurrentes hacia la misma sucursal podían no ver la fila que el
        -- otro estaba por crear y terminaban creando dos filas duplicadas
        -- para el mismo producto en vez de sumar a una sola. Lockear el
        -- maestro serializa a los remitos que tocan el mismo producto entre
        -- sí (el segundo espera a que el primero termine y recién ahí
        -- busca), sin afectar remitos de productos distintos.
        perform 1 from productos_maestro where id = v_origen.producto_maestro_id for update;
        select id into v_destino_id
          from productos
          where negocio_id = v_negocio and sucursal_id = p_sucursal_destino_id and producto_maestro_id = v_origen.producto_maestro_id
          for update;
      end if;

      if v_destino_id is not null then
        perform producto_mover_stock(v_destino_id, 'entrada', v_cantidad, 'Remito interno', p_usuario, null);
      else
        insert into productos (
          negocio_id, sucursal_id, producto_maestro_id, nombre, marca, categoria_id, modalidad, cantidad,
          precio, costo, sku, codigo_barras, descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url
        ) values (
          v_negocio, p_sucursal_destino_id, v_origen.producto_maestro_id, v_origen.nombre, v_origen.marca, v_origen.categoria_id,
          v_origen.modalidad, v_cantidad, v_origen.precio, v_origen.costo, v_origen.sku, v_origen.codigo_barras,
          v_origen.descripcion, v_origen.garantia_dias, v_origen.stock_minimo, v_origen.proveedor_id, v_origen.imagen_url
        );
      end if;
    end if;

    insert into remito_internos_items (remito_id, tipo_item, producto_maestro_id, producto_origen_id, nombre_snapshot, marca_snapshot, cantidad)
    values (v_remito_id, 'producto', v_origen.producto_maestro_id, v_origen.id, v_origen.nombre, v_origen.marca, v_cantidad);
  end loop;

  return v_remito_id;
end $$;

grant execute on function crear_remito_interno(uuid, uuid, jsonb, text, text) to authenticated;
