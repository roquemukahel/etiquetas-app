-- ============================================================
-- QOVENTO — TODO junto (correr UNA sola vez en el SQL Editor de Supabase; es seguro repetirlo):
--   1) Remito interno con cantidad       (remito_cantidad_supabase.sql)
--   2) Egresos: dueños, traslado/arqueo  (egresos_duenos_supabase.sql)
--   3) Servicio Técnico: recibido por    (servicio_tecnico_recibido_por_supabase.sql)
-- ============================================================

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


-- ============================================================
-- QOVENTO — Egresos: retiros automáticos de caja con categoría propia, categorías
-- "solo dueños", función de cada categoría (retiros de dueños / sueldo de dueños /
-- traslado-arqueo) y "Pagado desde" (caja del local / billetera del dueño).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- Requiere haber corrido antes egresos_supabase.sql y caja_vuelto_separado_supabase.sql.
-- ============================================================

-- 1) Categorías: "solo dueños" y función
alter table egresos_categorias add column if not exists solo_duenos boolean not null default false;
alter table egresos_categorias add column if not exists rol text;
alter table egresos_categorias drop constraint if exists egresos_categorias_rol_valido;
alter table egresos_categorias add constraint egresos_categorias_rol_valido
  check (rol is null or rol in ('retiro_duenos', 'sueldo_duenos', 'traslado_arqueo'));
-- Una sola categoría activa por función en cada negocio.
create unique index if not exists uq_egresos_categorias_rol
  on egresos_categorias(negocio_id, rol) where rol is not null and not archivada;

-- 2) Egresos: desde dónde se pagó
alter table egresos add column if not exists pagado_desde text not null default 'caja';
alter table egresos drop constraint if exists egresos_pagado_desde_valido;
alter table egresos add constraint egresos_pagado_desde_valido check (pagado_desde in ('caja', 'billetera_dueno'));

-- 3) Las categorías que el negocio ya tenía para dueños se reconocen por nombre (sin tildes, sin
--    mayúsculas). Se puede cambiar después desde Configuración > Categorías de egresos.
update egresos_categorias
   set solo_duenos = true
 where not archivada
   and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in
       ('sueldo duenos', 'sueldos duenos', 'sueldo de duenos', 'retiros de duenos', 'retiro de duenos', 'retiros duenos',
        'inversiones', 'pago de capital de prestamos');

with elegido as (
  select distinct on (negocio_id) id
    from egresos_categorias
   where not archivada and rol is null
     and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in ('retiros de duenos', 'retiro de duenos', 'retiros duenos')
     and not exists (select 1 from egresos_categorias x where x.negocio_id = egresos_categorias.negocio_id and x.rol = 'retiro_duenos' and not x.archivada)
   order by negocio_id, created_at
)
update egresos_categorias c set rol = 'retiro_duenos' from elegido e where c.id = e.id;

with elegido as (
  select distinct on (negocio_id) id
    from egresos_categorias
   where not archivada and rol is null
     and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in ('sueldo duenos', 'sueldos duenos', 'sueldo de duenos')
     and not exists (select 1 from egresos_categorias x where x.negocio_id = egresos_categorias.negocio_id and x.rol = 'sueldo_duenos' and not x.archivada)
   order by negocio_id, created_at
)
update egresos_categorias c set rol = 'sueldo_duenos' from elegido e where c.id = e.id;

-- 4) Categoría "Traslado / arqueo" para los retiros automáticos del cierre de turno (una por negocio).
update egresos_categorias c
   set rol = 'traslado_arqueo'
 where not c.archivada and c.rol is null
   and lower(translate(c.nombre, 'áéíóúñ', 'aeioun')) = 'traslado / arqueo'
   and not exists (select 1 from egresos_categorias x where x.negocio_id = c.negocio_id and x.rol = 'traslado_arqueo' and not x.archivada);

insert into egresos_categorias (negocio_id, nombre, orden, rol)
select n.id, 'Traslado / arqueo', 99, 'traslado_arqueo'
  from negocios n
 where not exists (select 1 from egresos_categorias x where x.negocio_id = n.id and x.rol = 'traslado_arqueo' and not x.archivada)
   and not exists (select 1 from egresos_categorias y where y.negocio_id = n.id and lower(y.nombre) = 'traslado / arqueo' and not y.archivada);

-- Esa categoría no es un gasto (si el negocio ya usa el campo tipo_gasto).
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'egresos_categorias' and column_name = 'tipo_gasto') then
    execute $q$update egresos_categorias set tipo_gasto = 'no_es_gasto' where rol = 'traslado_arqueo' and tipo_gasto is distinct from 'no_es_gasto'$q$;
  end if;
end $$;

-- Los retiros automáticos que ya existían (sin categoría) pasan a "Traslado / arqueo".
update egresos e
   set categoria_id = c.id
  from egresos_categorias c
 where e.categoria_id is null
   and e.caja_turno_id is not null
   and c.negocio_id = e.negocio_id
   and c.rol = 'traslado_arqueo'
   and not c.archivada;

-- 5) caja_cerrar_turno: igual que en caja_vuelto_separado_supabase.sql, pero el retiro automático
--    queda con la categoría "Traslado / arqueo" (la crea si no existe).
create or replace function caja_cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado numeric,
  p_observacion text default null,
  p_cerrada_por text default null,
  p_efectivo_vuelto numeric default null
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_caja cajas;
  v_total_efectivo numeric;
  v_esperado numeric;
  v_vuelto numeric;
  v_retiro numeric;
  v_categoria uuid;
begin
  select * into v_turno from caja_turnos where id = p_turno_id and negocio_id = negocio_actual() for update;
  if not found then
    raise exception 'Turno inexistente o de otro negocio';
  end if;
  if v_turno.estado <> 'abierta' then
    raise exception 'Este turno ya está cerrado';
  end if;

  select * into v_caja from cajas where id = v_turno.caja_id;

  select coalesce(sum(monto), 0) into v_total_efectivo
  from pagos
  where negocio_id = negocio_actual()
    and caja_tipo = v_caja.tipo
    and medio = 'efectivo'
    and moneda = v_turno.moneda
    and not anulado
    and fecha >= v_turno.abierta_en
    and fecha <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_esperado := v_turno.efectivo_inicial + v_total_efectivo;

  v_vuelto := coalesce(p_efectivo_vuelto, p_efectivo_declarado);
  v_retiro := greatest(0, p_efectivo_declarado - v_vuelto);

  update caja_turnos
  set estado = 'cerrada',
      cerrada_en = now(),
      cerrada_por = p_cerrada_por,
      efectivo_declarado = p_efectivo_declarado,
      efectivo_vuelto = v_vuelto,
      efectivo_esperado = v_esperado,
      diferencia = p_efectivo_declarado - v_esperado,
      observacion = p_observacion
  where id = p_turno_id
  returning * into v_turno;

  if v_retiro > 0.009 then
    select id into v_categoria from egresos_categorias
     where negocio_id = negocio_actual() and rol = 'traslado_arqueo' and not archivada limit 1;
    if v_categoria is null then
      begin
        insert into egresos_categorias (negocio_id, nombre, orden, rol)
        values (negocio_actual(), 'Traslado / arqueo', 99, 'traslado_arqueo')
        returning id into v_categoria;
      exception when unique_violation then
        select id into v_categoria from egresos_categorias
         where negocio_id = negocio_actual() and lower(nombre) = 'traslado / arqueo' and not archivada limit 1;
      end;
    end if;

    insert into egresos (negocio_id, sucursal_id, caja_turno_id, categoria_id, tipo, descripcion, importe, moneda, medio_pago, registrado_por_nombre)
    values (
      negocio_actual(),
      v_caja.sucursal_id,
      p_turno_id,
      v_categoria,
      'retiro',
      'Retiro de caja al cerrar el turno N° ' || v_turno.numero || ' de ' || v_caja.nombre,
      v_retiro,
      v_turno.moneda,
      'efectivo',
      p_cerrada_por
    );
  end if;

  return v_turno;
end;
$$;


-- ============================================================
-- QOVENTO — Servicio Técnico: quién recibió el equipo.
-- Hoy una orden de reparación queda "Vend.: Sin asignar" hasta que alguien la cobra, y en la ficha no
-- quedaba registrado quién la recibió. Esto guarda, al recibir el equipo, la persona que se identificó
-- con su PIN — aparte del vendedor que después la cobra.
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================
alter table reparaciones add column if not exists recibido_por_nombre text;
alter table reparaciones add column if not exists recibido_por_foto_url text;
