-- ============================================================
-- QOVENTO — Remito Interno: congelar el costo de cada ítem al momento de
-- crear el remito. Antes el "valor a costo" del comprobante se calculaba con
-- el costo ACTUAL del producto/equipo, así que un remito de hace meses
-- cambiaba de valor cada vez que se actualizaba un costo. Migración ADITIVA
-- e IDEMPOTENTE (se puede correr más de una vez). Requiere haber corrido
-- antes remitos_internos_supabase.sql.
-- ============================================================

alter table remito_internos_items add column if not exists costo_snapshot numeric;

-- Remitos que ya existían: se les "congela" el costo que tienen hoy (es lo que
-- ya mostraba el comprobante) para que de acá en adelante no se muevan más.
update remito_internos_items i
   set costo_snapshot = p.costo
  from productos p
 where i.costo_snapshot is null
   and i.producto_origen_id = p.id
   and p.costo is not null;

update remito_internos_items i
   set costo_snapshot = d.costo
  from dispositivos d
 where i.costo_snapshot is null
   and i.dispositivo_origen_id = d.id
   and d.costo is not null;

-- Misma función de siempre (ver remitos_internos_supabase.sql para el detalle
-- de cada paso); lo único nuevo es que cada ítem guarda su costo del momento.
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
          v_origen.modalidad, v_cantidad, v_origen.precio, v_origen.costo, v_origen.sku, v_origen.codigo_barras,
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
