-- ============================================================
-- Fix puntual: admin_negocios_directorio daba "structure of query does
-- not match function result type" — para no arriesgarse a que un
-- "create or replace" anterior haya dejado la forma de columnas a medio
-- actualizar, se borra la función entera y se crea de cero.
-- Seguro de correr: solo esta función, nada más se toca.
-- ============================================================

drop function if exists admin_negocios_directorio(text, text, text, text, text, int, int);

create function admin_negocios_directorio(
  p_busqueda text default null,
  p_vista text default 'todos',
  p_plan text default null,
  p_orden_campo text default 'created_at',
  p_orden_dir text default 'desc',
  p_pagina int default 1,
  p_por_pagina int default 25
)
returns table (
  id uuid,
  nombre text,
  activo boolean,
  estado_suscripcion text,
  plan text,
  fecha_fin_prueba timestamptz,
  acceso_manual_hasta timestamptz,
  created_at timestamptz,
  propietario_email text,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  ultima_actividad timestamptz,
  ultimo_pago_at timestamptz,
  ultimo_pago_monto numeric,
  ultimo_pago_moneda text,
  comprobantes_pendientes bigint,
  vencimiento timestamptz,
  total_count bigint
)
language plpgsql
security definer
as $$
declare
  v_campo text;
  v_dir text;
  v_offset int;
  v_sql text;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  v_campo := case p_orden_campo
    when 'nombre' then 'nombre'
    when 'ultima_actividad' then 'ultima_actividad'
    when 'vencimiento' then 'vencimiento'
    else 'created_at'
  end;
  v_dir := case when lower(coalesce(p_orden_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_offset := greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 25), 1);

  v_sql := format(
    'with base as (
      select
        n.id, n.nombre, n.activo, n.estado_suscripcion, n.plan,
        n.fecha_fin_prueba, n.acceso_manual_hasta, n.created_at,
        (select u.email from perfiles p join auth.users u on u.id = p.id
           where p.negocio_id = n.id order by p.created_at asc limit 1) as propietario_email,
        (select count(*) from perfiles p where p.negocio_id = n.id) as cantidad_usuarios,
        (select count(*) from dispositivos d where d.negocio_id = n.id) as cantidad_dispositivos,
        (select count(*) from ordenes o where o.negocio_id = n.id) as cantidad_ordenes,
        greatest(
          n.created_at,
          coalesce((select max(o.created_at) from ordenes o where o.negocio_id = n.id), n.created_at),
          coalesce((select max(d.created_at) from dispositivos d where d.negocio_id = n.id), n.created_at)
        ) as ultima_actividad,
        up.revisado_at as ultimo_pago_at,
        up.monto as ultimo_pago_monto,
        up.moneda as ultimo_pago_moneda,
        (select count(*) from comprobantes_pago c where c.negocio_id = n.id and c.estado = ''pendiente'') as comprobantes_pendientes,
        coalesce(
          case when n.estado_suscripcion = ''trialing'' then n.fecha_fin_prueba else n.acceso_manual_hasta end,
          ''infinity''::timestamptz
        ) as vencimiento
      from negocios n
      left join lateral (
        select c.revisado_at, c.monto, c.moneda
        from comprobantes_pago c
        where c.negocio_id = n.id and c.estado = ''aprobado''
        order by c.revisado_at desc nulls last
        limit 1
      ) up on true
    )
    select *, count(*) over() as total_count
    from base
    where
      ($1 is null or $1 = '''' or nombre ilike ''%%'' || $1 || ''%%'' or propietario_email ilike ''%%'' || $1 || ''%%'' or id::text = $1)
      and (
        $2 = ''todos''
        or ($2 = ''activos'' and estado_suscripcion = ''active'')
        or ($2 = ''en_prueba'' and estado_suscripcion = ''trialing'')
        or ($2 = ''por_vencer'' and vencimiento <= now() + interval ''7 days'' and vencimiento >= now())
        or ($2 = ''pago_pendiente'' and (estado_suscripcion in (''past_due'',''unpaid'') or comprobantes_pendientes > 0))
        or ($2 = ''inactivos'' and activo = false)
        or ($2 = ''cancelados'' and estado_suscripcion in (''cancelled'',''expired'',''paused''))
        or ($2 = ''sin_configurar'' and cantidad_dispositivos = 0)
      )
      and ($3 is null or $3 = '''' or plan = $3)
    order by %I %s nulls last
    limit $4 offset $5',
    v_campo, v_dir
  );

  return query execute v_sql using p_busqueda, coalesce(p_vista, 'todos'), p_plan, coalesce(p_por_pagina, 25), v_offset;
end;
$$;
