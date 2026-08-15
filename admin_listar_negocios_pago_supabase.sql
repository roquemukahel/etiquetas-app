-- Panel Admin: suma la fecha y el monto del último pago APROBADO de cada
-- negocio a admin_listar_negocios(), para poder ver de un vistazo "hace
-- cuánto pagó" sin tener que ir a buscarlo aparte.
drop function if exists admin_listar_negocios();

create or replace function admin_listar_negocios()
returns table (
  id uuid,
  nombre text,
  activo boolean,
  creado timestamptz,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  ultima_actividad timestamptz,
  estado_suscripcion text,
  fecha_fin_prueba timestamptz,
  plan text,
  acceso_manual_hasta timestamptz,
  ultimo_pago_at timestamptz,
  ultimo_pago_monto numeric,
  ultimo_pago_moneda text
)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select
      n.id,
      n.nombre,
      n.activo,
      n.created_at,
      (select count(*) from perfiles p where p.negocio_id = n.id),
      (select count(*) from dispositivos d where d.negocio_id = n.id),
      (select count(*) from ordenes o where o.negocio_id = n.id),
      greatest(
        n.created_at,
        coalesce((select max(created_at) from ordenes o where o.negocio_id = n.id), n.created_at),
        coalesce((select max(created_at) from dispositivos d where d.negocio_id = n.id), n.created_at)
      ),
      n.estado_suscripcion,
      n.fecha_fin_prueba,
      n.plan,
      n.acceso_manual_hasta,
      up.revisado_at,
      up.monto,
      up.moneda
    from negocios n
    left join lateral (
      select c.revisado_at, c.monto, c.moneda
      from comprobantes_pago c
      where c.negocio_id = n.id and c.estado = 'aprobado'
      order by c.revisado_at desc nulls last
      limit 1
    ) up on true
    order by n.created_at desc;
end;
$$;
