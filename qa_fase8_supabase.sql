-- ============================================================
-- Servicio Técnico PRO — Fase 8 (QA final): endurece dos funciones RPC
-- de Fase 5 para que además de validar el repuesto por RLS, verifiquen
-- explícitamente que la reparación pasada por parámetro sea del MISMO
-- negocio que el repuesto — antes se confiaba en que el UUID de la
-- reparación nunca se pudiera adivinar/filtrar desde otra empresa, lo
-- cual es cierto hoy, pero esto lo deja blindado también si eso
-- cambiara (ej. un futuro endpoint público que exponga IDs).
--
-- "create or replace function" es seguro de re-ejecutar: no hace falta
-- "drop" porque no cambia la firma ni el tipo de retorno.
-- ============================================================

create or replace function repuesto_consumir(
  p_repuesto_id uuid,
  p_reparacion_id uuid,
  p_cantidad numeric,
  p_actor_nombre text,
  p_forzar boolean default false
)
returns void
language plpgsql
as $$
declare
  v_repuesto repuestos%rowtype;
  v_nuevo_stock numeric;
  v_negocio_reparacion uuid;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into v_repuesto from repuestos where id = p_repuesto_id for update;
  if not found then
    raise exception 'El repuesto no existe';
  end if;

  select negocio_id into v_negocio_reparacion from reparaciones where id = p_reparacion_id;
  if v_negocio_reparacion is null or v_negocio_reparacion <> v_repuesto.negocio_id then
    raise exception 'La reparación no existe o no pertenece a este negocio';
  end if;

  v_nuevo_stock := v_repuesto.cantidad_stock - p_cantidad;
  if v_nuevo_stock < 0 and not p_forzar then
    raise exception 'STOCK_INSUFICIENTE:%', v_repuesto.cantidad_stock;
  end if;

  update repuestos set cantidad_stock = v_nuevo_stock where id = p_repuesto_id;

  insert into reparaciones_repuestos (reparacion_id, repuesto_id, nombre_repuesto, cantidad, costo_unitario, actor_nombre)
  values (p_reparacion_id, p_repuesto_id, v_repuesto.nombre, p_cantidad, v_repuesto.costo_unitario, p_actor_nombre);

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, costo_unitario, reparacion_id, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, 'consumo', -p_cantidad, v_repuesto.costo_unitario, p_reparacion_id, p_actor_nombre);
end;
$$;

create or replace function repuesto_reservar(
  p_repuesto_id uuid,
  p_reparacion_id uuid,
  p_cantidad numeric,
  p_actor_nombre text
)
returns uuid
language plpgsql
as $$
declare
  v_repuesto repuestos%rowtype;
  v_disponible numeric;
  v_reserva_id uuid;
  v_negocio_reparacion uuid;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into v_repuesto from repuestos where id = p_repuesto_id for update;
  if not found then
    raise exception 'El repuesto no existe';
  end if;

  select negocio_id into v_negocio_reparacion from reparaciones where id = p_reparacion_id;
  if v_negocio_reparacion is null or v_negocio_reparacion <> v_repuesto.negocio_id then
    raise exception 'La reparación no existe o no pertenece a este negocio';
  end if;

  v_disponible := v_repuesto.cantidad_stock - v_repuesto.cantidad_reservada;
  if p_cantidad > v_disponible then
    raise exception 'DISPONIBLE_INSUFICIENTE:%', v_disponible;
  end if;

  update repuestos set cantidad_reservada = cantidad_reservada + p_cantidad where id = p_repuesto_id;

  insert into repuestos_reservas (repuesto_id, reparacion_id, cantidad, actor_nombre)
  values (p_repuesto_id, p_reparacion_id, p_cantidad, p_actor_nombre)
  returning id into v_reserva_id;

  insert into repuestos_movimientos (repuesto_id, nombre_repuesto, tipo, cantidad, reparacion_id, actor_nombre)
  values (p_repuesto_id, v_repuesto.nombre, 'reserva', p_cantidad, p_reparacion_id, p_actor_nombre);

  return v_reserva_id;
end;
$$;

-- Permite reabrir un presupuesto rechazado para pedirle al cliente que lo
-- responda de nuevo (ej. el taller ofrece un precio revisado) — antes,
-- una vez rechazado, no había forma de volver a mandarlo ni de aprobarlo
-- manualmente (quedaba en un callejón sin salida). Reabrir vuelve
-- presupuesto_estado a null; el flujo de envío/aprobación de siempre
-- sigue funcionando igual desde ahí.
create or replace function reparacion_reabrir_presupuesto(p_reparacion_id uuid, p_actor_nombre text)
returns void
language plpgsql
as $$
begin
  update reparaciones
  set presupuesto_estado = null,
      presupuesto_enviado_at = null,
      presupuesto_medio = null,
      presupuesto_respondido_at = null,
      presupuesto_importe_aceptado = null,
      presupuesto_texto_aceptado = null
  where id = p_reparacion_id
    and presupuesto_estado = 'rechazado';

  if found then
    insert into reparaciones_eventos (reparacion_id, tipo, texto, actor_nombre)
    values (p_reparacion_id, 'sistema', 'Se reabrió el presupuesto para una nueva respuesta', p_actor_nombre);
  end if;
end;
$$;
