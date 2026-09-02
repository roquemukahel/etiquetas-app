-- Repuestos de Servicio Técnico por sucursal — hasta ahora `repuestos` era la
-- única tabla de stock que NO tenía sucursal_id (dispositivos/productos sí,
-- ver sucursales_supabase.sql). Pedido explícito: poder cargar stock
-- separado del mismo repuesto por local (ej. 10 pantallas en sucursal 1, 10
-- en sucursal 2), en vez de una sola cantidad global.
--
-- Mismo patrón exacto que las demás tablas: columna nullable (repuestos
-- existentes quedan "sin sucursal asignada" hasta que se sincronicen), más
-- el índice para filtrar rápido.
alter table repuestos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
create index if not exists idx_repuestos_sucursal on repuestos(sucursal_id);

-- Se suma repuestos al backfill de "Volver a sincronizar" (Configuración >
-- Sucursales) — create or replace mantiene el resto de la función intacta,
-- solo agrega esta tabla a la lista. Sigue siendo idempotente: solo toca
-- filas con sucursal_id null, nunca pisa una ya asignada a mano.
create or replace function activar_multisucursal(p_nombre_principal text default 'Sucursal principal')
returns uuid language plpgsql security definer as $$
declare
  v_negocio uuid := negocio_actual();
  v_sucursal_id uuid;
begin
  if v_negocio is null then raise exception 'Sin negocio'; end if;

  select id into v_sucursal_id from sucursales
    where negocio_id = v_negocio and not archivada
    order by created_at asc limit 1;

  if v_sucursal_id is null then
    insert into sucursales (negocio_id, nombre)
    values (v_negocio, p_nombre_principal)
    returning id into v_sucursal_id;
  end if;

  update dispositivos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update productos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update vendedores set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update tecnicos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update ordenes set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update reparaciones set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update egresos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update pagos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update cta_cte_movimientos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;
  update repuestos set sucursal_id = v_sucursal_id where negocio_id = v_negocio and sucursal_id is null;

  update negocios set multisucursal_activo = true where id = v_negocio;

  return v_sucursal_id;
end $$;

grant execute on function activar_multisucursal(text) to authenticated;
