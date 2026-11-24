-- ============================================================
-- QOVENTO — Remito Interno con cantidad para productos "por cantidad".
--
-- Problema (cliente con ~500 productos): al armar un remito, productos con varias unidades
-- (ej. Funda escamada con 8 unidades) quedaban fijos en "1 unidad" y el remito no dejaba
-- mandar más. Causa: esas filas están marcadas como modalidad 'serializado' (se cargaron como
-- "individual", con 1 unidad, y después se les subió la cantidad), y el remito trata a los
-- serializados como una sola unidad física.
--
-- Qué hace este SQL (ADITIVO e IDEMPOTENTE, se puede correr más de una vez):
--  1) Corrige los datos: un producto 'serializado' SIN número de serie y con más de 1 unidad
--     pasa a 'cantidad' (un serializado es una sola unidad por definición).
--  2) producto_mover_stock: cada vez que una fila 'serializado' sin número de serie queda con
--     más de 1 unidad (ajuste manual, ingreso, devolución...), pasa sola a 'cantidad'. Así no
--     vuelve a quedar inconsistente. Es la misma función de siempre + ese paso.
--  3) crear_remito_interno: trata como serializado solo a lo que tiene 1 unidad o menos; lo que
--     tiene más unidades se transfiere por cantidad (descuenta en origen, suma en destino).
-- Requiere haber corrido antes categorias_stock_supabase.sql y remito_costo_congelado_supabase.sql.
-- ============================================================

-- 1) Datos
update productos
   set modalidad = 'cantidad'
 where modalidad = 'serializado'
   and cantidad > 1
   and coalesce(numero_serie, '') = '';

-- 2) producto_mover_stock (igual que en categorias_stock_supabase.sql + la normalización de modalidad)
create or replace function producto_mover_stock(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad int,
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
    else p_cantidad
  end;
  v_nueva := v_actual + v_delta;
  if v_nueva < 0 then
    raise exception 'Stock insuficiente: quedan % y se intentó descontar %', v_actual, abs(v_delta);
  end if;

  update productos set cantidad = v_nueva where id = p_producto_id;

  -- Una fila 'serializado' sin número de serie con más de 1 unidad es, en la práctica, un producto por cantidad.
  if v_nueva > 1 then
    update productos set modalidad = 'cantidad'
     where id = p_producto_id and modalidad = 'serializado' and coalesce(numero_serie, '') = '';
  end if;

  insert into producto_movimientos (negocio_id, producto_id, tipo, cantidad, cantidad_resultante, motivo, usuario, orden_id)
  values (v_negocio, p_producto_id, p_tipo, abs(v_delta), v_nueva, p_motivo, p_usuario, p_orden_id);

  return v_nueva;
end $$;

grant execute on function producto_mover_stock(uuid, text, int, text, text, uuid) to authenticated;

-- 3) crear_remito_interno
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
      select id, modelo, costo into v_disp
        from dispositivos
        where id = v_id and negocio_id = v_negocio and sucursal_id = p_sucursal_origen_id and en_stock = true
        for update;
      if not found then
        raise exception 'Dispositivo % no encontrado en la sucursal de origen', v_id;
      end if;
      update dispositivos set sucursal_id = p_sucursal_destino_id where id = v_disp.id;

      insert into remito_internos_items (remito_id, tipo_item, dispositivo_origen_id, nombre_snapshot, marca_snapshot, cantidad, costo_snapshot)
      values (v_remito_id, 'dispositivo', v_disp.id, coalesce(v_disp.modelo, 'Sin modelo'), null, 1, v_disp.costo);
      continue;
    end if;

    select id, nombre, marca, modalidad, cantidad, producto_maestro_id, categoria_id, precio, costo, sku, codigo_barras,
           descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url
      into v_origen
      from productos
      where id = v_id and negocio_id = v_negocio and sucursal_id = p_sucursal_origen_id
      for update;
    if not found then
      raise exception 'Producto % no encontrado en la sucursal de origen', v_id;
    end if;

    -- Una unidad serializada es UNA sola unidad (cantidad <= 1). Si la fila figura como 'serializado' pero tiene
    -- más de una unidad (pasa cuando se cargó como individual y después se le subió la cantidad), se maneja
    -- por cantidad como cualquier accesorio: antes quedaba clavada en "1 unidad" y no se podía transferir más.
    if v_origen.modalidad = 'serializado' and coalesce(v_origen.cantidad, 1) <= 1 then
      if v_cantidad <> 1 then
        raise exception 'Un producto serializado se transfiere de a 1 unidad';
      end if;
      update productos set sucursal_id = p_sucursal_destino_id where id = v_origen.id;
    else
      perform producto_mover_stock(v_origen.id, 'salida', v_cantidad, 'Remito interno', p_usuario, null);

      v_destino_id := null;
      if v_origen.producto_maestro_id is not null then
        -- Lockea el maestro ANTES de buscar la fila destino (ver el comentario
        -- completo en remitos_internos_supabase.sql): evita filas duplicadas
        -- cuando dos remitos concurrentes van a la misma sucursal.
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
          case when v_origen.modalidad = 'serializado' and v_cantidad > 1 then 'cantidad' else v_origen.modalidad end,
          v_cantidad, v_origen.precio, v_origen.costo, v_origen.sku, v_origen.codigo_barras,
          v_origen.descripcion, v_origen.garantia_dias, v_origen.stock_minimo, v_origen.proveedor_id, v_origen.imagen_url
        );
      end if;
    end if;

    insert into remito_internos_items (remito_id, tipo_item, producto_maestro_id, producto_origen_id, nombre_snapshot, marca_snapshot, cantidad, costo_snapshot)
    values (v_remito_id, 'producto', v_origen.producto_maestro_id, v_origen.id, v_origen.nombre, v_origen.marca, v_cantidad, v_origen.costo);
  end loop;

  return v_remito_id;
end $$;

grant execute on function crear_remito_interno(uuid, uuid, jsonb, text, text) to authenticated;
