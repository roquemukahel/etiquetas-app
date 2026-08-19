-- ============================================================
-- Panel Admin PRO: rediseño completo del centro de operaciones SaaS.
-- Aditivo e idempotente (create or replace / create table if not exists),
-- no toca ninguna tabla ni función existente fuera de lo indicado abajo.
-- Correr en Supabase > SQL Editor > Run, ANTES de mergear la rama
-- admin-panel-rediseno a producción.
-- ============================================================

-- ============================================================
-- 1) Auditoría GLOBAL de acciones del admin (distinta de la tabla
--    "auditoria" que ya existe: esa está scopeada por negocio_actual()
--    vía RLS, así que insertar ahí desde /admin quedaría atribuido al
--    negocio propio del admin, no al negocio que realmente se está
--    modificando. Esta es su propia tabla, sin policies (solo
--    accesible vía las funciones security definer de abajo), y guarda
--    un snapshot del nombre del negocio para que la fila siga siendo
--    legible aunque el negocio se elimine después (negocio_id queda
--    en null por el "on delete set null", pero el nombre persiste).
-- ============================================================
create table if not exists admin_auditoria (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id) on delete set null,
  negocio_nombre_snapshot text not null,
  admin_email text not null,
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  created_at timestamptz not null default now()
);

alter table admin_auditoria enable row level security;
-- Sin policies a propósito: nadie lee/escribe esto directo, solo las
-- funciones de abajo (mismo criterio que super_admins).

create index if not exists idx_admin_auditoria_negocio on admin_auditoria(negocio_id, created_at desc);
create index if not exists idx_admin_auditoria_created on admin_auditoria(created_at desc);

-- Helper interno: cada función admin_* de más abajo lo llama para dejar
-- registrada su propia acción. No se expone para llamarse directo desde
-- el cliente (no tiene sentido hacerlo), pero igual valida es_admin()
-- por las dudas, mismo criterio que el resto de las funciones de /admin.
create or replace function admin_registrar_accion(
  p_negocio_id uuid,
  p_accion text,
  p_entidad text,
  p_entidad_id uuid default null,
  p_valor_anterior jsonb default null,
  p_valor_nuevo jsonb default null,
  p_motivo text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_admin_email text;
  v_negocio_nombre text;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select email into v_admin_email from auth.users where id = auth.uid();
  select nombre into v_negocio_nombre from negocios where id = p_negocio_id;
  insert into admin_auditoria (negocio_id, negocio_nombre_snapshot, admin_email, accion, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
  values (p_negocio_id, coalesce(v_negocio_nombre, '(negocio eliminado)'), coalesce(v_admin_email, 'desconocido'), p_accion, p_entidad, p_entidad_id, p_valor_anterior, p_valor_nuevo, p_motivo);
end;
$$;

create or replace function admin_auditoria_listar(
  p_negocio_id uuid default null,
  p_pagina int default 1,
  p_por_pagina int default 50
)
returns table (
  id uuid,
  negocio_id uuid,
  negocio_nombre_snapshot text,
  admin_email text,
  accion text,
  entidad text,
  entidad_id uuid,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
as $$
declare
  v_offset int;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  v_offset := greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1);
  return query
    select a.id, a.negocio_id, a.negocio_nombre_snapshot, a.admin_email, a.accion, a.entidad,
           a.entidad_id, a.valor_anterior, a.valor_nuevo, a.motivo, a.created_at,
           count(*) over() as total_count
    from admin_auditoria a
    where p_negocio_id is null or a.negocio_id = p_negocio_id
    order by a.created_at desc
    limit p_por_pagina offset v_offset;
end;
$$;

-- ============================================================
-- 2) Notas y etiquetas administrativas por negocio (nunca visibles
--    para el cliente — solo accesibles vía funciones security definer).
-- ============================================================
create table if not exists negocios_notas_admin (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  texto text not null,
  etiqueta text,
  autor_email text not null,
  created_at timestamptz not null default now()
);

alter table negocios_notas_admin enable row level security;

alter table negocios_notas_admin drop constraint if exists etiqueta_nota_valida;
alter table negocios_notas_admin add constraint etiqueta_nota_valida
  check (etiqueta is null or etiqueta in (
    'vip', 'necesita_asistencia', 'contactar_antes_vencimiento',
    'prueba_extendida', 'incidencia_pago', 'cliente_recuperado'
  ));

create index if not exists idx_negocios_notas_admin_negocio on negocios_notas_admin(negocio_id, created_at desc);

create or replace function admin_agregar_nota(negocio_id_param uuid, texto_param text, etiqueta_param text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_admin_email text;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  if trim(coalesce(texto_param, '')) = '' then
    raise exception 'La nota no puede estar vacía';
  end if;
  select email into v_admin_email from auth.users where id = auth.uid();
  insert into negocios_notas_admin (negocio_id, texto, etiqueta, autor_email)
  values (negocio_id_param, texto_param, etiqueta_param, coalesce(v_admin_email, 'desconocido'));
  perform admin_registrar_accion(negocio_id_param, 'agregó una nota administrativa', 'nota', null, null,
    jsonb_build_object('texto', texto_param, 'etiqueta', etiqueta_param), null);
end;
$$;

create or replace function admin_listar_notas(negocio_id_param uuid)
returns table (id uuid, texto text, etiqueta text, autor_email text, created_at timestamptz)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select n.id, n.texto, n.etiqueta, n.autor_email, n.created_at
    from negocios_notas_admin n
    where n.negocio_id = negocio_id_param
    order by n.created_at desc;
end;
$$;

create or replace function admin_eliminar_nota(nota_id_param uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  delete from negocios_notas_admin where id = nota_id_param;
end;
$$;

-- ============================================================
-- 3) Se extienden las funciones admin_* que ya existían para que cada
--    una deje su propia fila en admin_auditoria (antes NINGUNA acción
--    del panel quedaba registrada). "create or replace" no rompe nada:
--    mismos nombres y parámetros de siempre, salvo admin_actualizar_suscripcion
--    y admin_eliminar_negocio, que suman parámetros nuevos (con default,
--    así que llamarlas como antes seguiría funcionando si algo más las
--    llamara — pero acá directamente se resuelve la firma vieja porque
--    cambia de "días desde hoy" a fecha exacta, ver más abajo).
-- ============================================================
create or replace function admin_set_negocio_activo(negocio_id_param uuid, nuevo_estado boolean)
returns void
language plpgsql
security definer
as $$
declare
  v_estado_anterior boolean;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select activo into v_estado_anterior from negocios where id = negocio_id_param;
  update negocios set activo = nuevo_estado where id = negocio_id_param;
  perform admin_registrar_accion(
    negocio_id_param,
    case when nuevo_estado then 'reactivó el acceso' else 'desactivó el acceso' end,
    'negocio', negocio_id_param,
    jsonb_build_object('activo', v_estado_anterior), jsonb_build_object('activo', nuevo_estado), null
  );
end;
$$;

-- La versión vieja recibía "dias_desde_hoy" (int) — Postgres identifica una
-- función por nombre + tipos de parámetro, así que cambiar a fechas
-- exactas (timestamptz) es, para Postgres, una función distinta: sin este
-- drop quedarían las dos versiones coexistiendo. Nada más en el código
-- llama a la versión vieja (se reemplaza el panel admin entero en este
-- mismo cambio), así que no rompe nada.
drop function if exists admin_actualizar_suscripcion(uuid, text, int, text, boolean);
drop function if exists admin_actualizar_suscripcion(uuid, text, int, text, boolean, text);

create or replace function admin_actualizar_suscripcion(
  neg_id uuid,
  nuevo_estado text default null,
  nueva_fecha_fin_prueba timestamptz default null,
  nuevo_acceso_manual_hasta timestamptz default null,
  nuevo_plan text default null,
  quitar_vencimiento boolean default false,
  p_motivo text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_anterior negocios%rowtype;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select * into v_anterior from negocios where id = neg_id;
  update negocios
  set estado_suscripcion = coalesce(nuevo_estado, estado_suscripcion),
      fecha_fin_prueba = coalesce(nueva_fecha_fin_prueba, fecha_fin_prueba),
      acceso_manual_hasta = case
        when quitar_vencimiento then null
        when nuevo_acceso_manual_hasta is not null then nuevo_acceso_manual_hasta
        else acceso_manual_hasta
      end,
      plan = coalesce(nuevo_plan, plan)
  where id = neg_id;
  perform admin_registrar_accion(
    neg_id, 'editó la suscripción', 'negocio', neg_id,
    jsonb_build_object(
      'estado_suscripcion', v_anterior.estado_suscripcion, 'plan', v_anterior.plan,
      'acceso_manual_hasta', v_anterior.acceso_manual_hasta, 'fecha_fin_prueba', v_anterior.fecha_fin_prueba
    ),
    jsonb_build_object(
      'estado_suscripcion', coalesce(nuevo_estado, v_anterior.estado_suscripcion), 'plan', coalesce(nuevo_plan, v_anterior.plan),
      'acceso_manual_hasta', case when quitar_vencimiento then null else coalesce(nuevo_acceso_manual_hasta, v_anterior.acceso_manual_hasta) end,
      'fecha_fin_prueba', coalesce(nueva_fecha_fin_prueba, v_anterior.fecha_fin_prueba)
    ),
    p_motivo
  );
end;
$$;

create or replace function admin_aprobar_pago(comprobante_id uuid, dias int, nuevo_plan text)
returns void
language plpgsql
security definer
as $$
declare
  neg_id uuid;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select negocio_id into neg_id from comprobantes_pago where id = comprobante_id;
  if neg_id is null then
    raise exception 'Comprobante no encontrado';
  end if;

  update comprobantes_pago
    set estado = 'aprobado', revisado_at = now(), revisado_por = auth.uid()::text
    where id = comprobante_id;

  update negocios
    set estado_suscripcion = 'active',
        acceso_manual_hasta = greatest(coalesce(acceso_manual_hasta, now()), now()) + (dias || ' days')::interval,
        plan = nuevo_plan
    where id = neg_id;

  perform admin_registrar_accion(neg_id, 'aprobó un pago', 'comprobante_pago', comprobante_id, null,
    jsonb_build_object('dias', dias, 'plan', nuevo_plan), null);
end;
$$;

create or replace function admin_rechazar_pago(comprobante_id uuid, motivo text)
returns void
language plpgsql
security definer
as $$
declare
  neg_id uuid;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select negocio_id into neg_id from comprobantes_pago where id = comprobante_id;
  update comprobantes_pago
    set estado = 'rechazado', nota_admin = motivo, revisado_at = now(), revisado_por = auth.uid()::text
    where id = comprobante_id;
  perform admin_registrar_accion(neg_id, 'rechazó un pago', 'comprobante_pago', comprobante_id, null, null, motivo);
end;
$$;

create or replace function admin_eliminar_usuario(usuario_id_param uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_email text;
  v_negocio_id uuid;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select email into v_email from auth.users where id = usuario_id_param;
  select negocio_id into v_negocio_id from perfiles where id = usuario_id_param;
  delete from auth.users where id = usuario_id_param;
  perform admin_registrar_accion(v_negocio_id, 'eliminó la cuenta de usuario', 'usuario', usuario_id_param,
    jsonb_build_object('email', v_email), null, null);
end;
$$;

create or replace function admin_eliminar_negocio(negocio_id_param uuid, p_motivo text default null)
returns void
language plpgsql
security definer
as $$
declare
  usuario_ids uuid[];
  v_conteos jsonb;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'usuarios', (select count(*) from perfiles where negocio_id = negocio_id_param),
    'dispositivos', (select count(*) from dispositivos where negocio_id = negocio_id_param),
    'ordenes', (select count(*) from ordenes where negocio_id = negocio_id_param)
  ) into v_conteos;

  select array_agg(id) into usuario_ids from perfiles where negocio_id = negocio_id_param;

  -- Se registra ANTES de borrar: admin_registrar_accion busca el nombre del
  -- negocio por id, y después de "delete from negocios" ya no lo encontraría.
  perform admin_registrar_accion(negocio_id_param, 'eliminó el negocio definitivamente', 'negocio', negocio_id_param,
    v_conteos, null, p_motivo);

  delete from negocios where id = negocio_id_param;

  if usuario_ids is not null then
    delete from auth.users where id = any(usuario_ids);
  end if;
end;
$$;

-- ============================================================
-- 4) Directorio profesional de negocios: búsqueda + filtros + orden +
--    paginación, todo del lado del servidor (nada de traer todo y
--    filtrar en el navegador). count(*) over() devuelve el total junto
--    con la página pedida, en un solo viaje.
--
--    Es la única función de este patch que arma parte de la consulta
--    con SQL dinámico (para poder ordenar por una columna variable,
--    que Postgres no permite parametrizar directo). Los VALORES del
--    usuario (búsqueda, vista, plan, página) van siempre por USING
--    (bind params reales, cero riesgo de inyección); lo único que entra
--    por %I/%s es el nombre de columna de orden, y ese sale de un CASE
--    fijo (v_campo), nunca del texto que mandó el cliente directo.
--
--    Se dropea antes de crearla: reemplazarla varias veces seguidas con
--    "create or replace" (mientras se ajustaba durante el desarrollo)
--    dejó en un momento la firma de columnas de salida desincronizada
--    del cuerpo real, y Postgres tiraba "structure of query does not
--    match function result type" en cada llamada. drop + create
--    garantiza que no quede nada pisado de una versión anterior.
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
        (select u.email::text from perfiles p join auth.users u on u.id = p.id
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

-- ============================================================
-- 5) Ficha individual del negocio: un solo viaje con todo lo que
--    necesita la pestaña "Resumen" + la lista de usuarios (con su
--    último acceso real, que Supabase Auth ya trackea en
--    auth.users.last_sign_in_at — no hace falta instrumentar nada
--    nuevo para ese dato puntual).
-- ============================================================
create or replace function admin_negocio_detalle(negocio_id_param uuid)
returns table (
  id uuid,
  nombre text,
  activo boolean,
  estado_suscripcion text,
  plan text,
  fecha_fin_prueba timestamptz,
  acceso_manual_hasta timestamptz,
  created_at timestamptz,
  telefono text,
  pais text,
  moneda text,
  lemonsqueezy_customer_id text,
  lemonsqueezy_subscription_id text,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  cantidad_reparaciones bigint,
  cantidad_clientes bigint,
  ordenes_30d bigint,
  reparaciones_30d bigint,
  ultima_actividad timestamptz,
  usuarios jsonb
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
      n.id, n.nombre, n.activo, n.estado_suscripcion, n.plan,
      n.fecha_fin_prueba, n.acceso_manual_hasta, n.created_at,
      n.telefono, n.pais, n.moneda,
      n.lemonsqueezy_customer_id, n.lemonsqueezy_subscription_id,
      (select count(*) from perfiles p where p.negocio_id = n.id),
      (select count(*) from dispositivos d where d.negocio_id = n.id),
      (select count(*) from ordenes o where o.negocio_id = n.id),
      (select count(*) from reparaciones r where r.negocio_id = n.id),
      (select count(*) from clientes c where c.negocio_id = n.id),
      (select count(*) from ordenes o where o.negocio_id = n.id and o.created_at >= now() - interval '30 days'),
      (select count(*) from reparaciones r where r.negocio_id = n.id and r.created_at >= now() - interval '30 days'),
      greatest(
        n.created_at,
        coalesce((select max(o.created_at) from ordenes o where o.negocio_id = n.id), n.created_at),
        coalesce((select max(d.created_at) from dispositivos d where d.negocio_id = n.id), n.created_at)
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', u.id, 'email', u.email, 'creado', p.created_at, 'ultimo_acceso', u.last_sign_in_at
        ) order by p.created_at)
        from perfiles p join auth.users u on u.id = p.id
        where p.negocio_id = n.id
      ), '[]'::jsonb)
    from negocios n
    where n.id = negocio_id_param;
end;
$$;

-- ============================================================
-- 6) Pagos: listado global paginado de comprobantes (para la sección
--    "Pagos" del panel, distinto de admin_listar_comprobantes que ya
--    existe y sigue igual — esa es por negocio, para la ficha; esta es
--    cross-tenant, para la vista general).
-- ============================================================
create or replace function admin_pagos_listar(
  p_estado text default null,
  p_pagina int default 1,
  p_por_pagina int default 25
)
returns table (
  id uuid,
  negocio_id uuid,
  nombre_negocio text,
  monto numeric,
  moneda text,
  comprobante_imagen text,
  referencia text,
  estado text,
  nota_admin text,
  created_at timestamptz,
  revisado_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
as $$
declare
  v_offset int;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  v_offset := greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 25), 1);
  return query
    select c.id, c.negocio_id, n.nombre, c.monto, c.moneda, c.comprobante_imagen, c.referencia,
           c.estado, c.nota_admin, c.created_at, c.revisado_at, count(*) over() as total_count
    from comprobantes_pago c
    join negocios n on n.id = c.negocio_id
    where p_estado is null or p_estado = '' or c.estado = p_estado
    order by c.created_at desc
    limit p_por_pagina offset v_offset;
end;
$$;

-- ============================================================
-- 7) Dashboard: métricas reales (sin inventar MRR/ARR/conversión ni
--    churn — esos requieren datos que hoy no se guardan, ver diagnóstico).
-- ============================================================
create or replace function admin_resumen_metricas(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_resultado jsonb;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select jsonb_build_object(
    'negocios_registrados_total', (select count(*) from negocios),
    'negocios_activos', (select count(*) from negocios where activo),
    'suscripciones_pagas_activas', (select count(*) from negocios where estado_suscripcion = 'active'),
    'negocios_en_prueba', (select count(*) from negocios where estado_suscripcion = 'trialing'),
    'nuevos_registros_periodo', (select count(*) from negocios where created_at >= p_desde and created_at < p_hasta),
    'nuevos_registros_periodo_anterior', (
      select count(*) from negocios
      where created_at >= p_desde - (p_hasta - p_desde) and created_at < p_desde
    ),
    'pruebas_por_vencer_3d', (select count(*) from negocios where estado_suscripcion = 'trialing' and fecha_fin_prueba between now() and now() + interval '3 days'),
    'pruebas_por_vencer_7d', (select count(*) from negocios where estado_suscripcion = 'trialing' and fecha_fin_prueba between now() and now() + interval '7 days'),
    'pruebas_por_vencer_14d', (select count(*) from negocios where estado_suscripcion = 'trialing' and fecha_fin_prueba between now() and now() + interval '14 days'),
    'pago_pendiente', (select count(*) from negocios where estado_suscripcion in ('past_due', 'unpaid')),
    'comprobantes_pendientes', (select count(*) from comprobantes_pago where estado = 'pendiente'),
    'suspendidos_manual', (select count(*) from negocios where not activo),
    'cancelados_o_expirados', (select count(*) from negocios where estado_suscripcion in ('cancelled', 'expired', 'paused')),
    'ingresos_periodo_por_moneda', (
      select coalesce(jsonb_object_agg(moneda, total), '{}'::jsonb)
      from (
        select moneda, sum(monto) as total
        from comprobantes_pago
        where estado = 'aprobado' and revisado_at >= p_desde and revisado_at < p_hasta
        group by moneda
      ) t
    ),
    'negocios_activos_7d', (
      select count(*) from negocios n
      where exists (select 1 from ordenes o where o.negocio_id = n.id and o.created_at >= now() - interval '7 days')
         or exists (select 1 from dispositivos d where d.negocio_id = n.id and d.created_at >= now() - interval '7 days')
    ),
    'negocios_activos_30d', (
      select count(*) from negocios n
      where exists (select 1 from ordenes o where o.negocio_id = n.id and o.created_at >= now() - interval '30 days')
         or exists (select 1 from dispositivos d where d.negocio_id = n.id and d.created_at >= now() - interval '30 days')
    ),
    'negocios_sin_configurar', (
      select count(*) from negocios n
      where not exists (select 1 from dispositivos d where d.negocio_id = n.id)
        and not exists (select 1 from clientes c where c.negocio_id = n.id)
    )
  ) into v_resultado;
  return v_resultado;
end;
$$;

create or replace function admin_evolucion_registros(p_desde timestamptz, p_hasta timestamptz)
returns table (dia date, cantidad bigint)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select date_trunc('day', created_at)::date as dia, count(*) as cantidad
    from negocios
    where created_at >= p_desde and created_at < p_hasta
    group by 1
    order by 1;
end;
$$;

create or replace function admin_distribucion_planes()
returns table (plan text, cantidad bigint)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select coalesce(n.plan, 'sin_plan') as plan, count(*) as cantidad
    from negocios n
    where n.estado_suscripcion in ('active', 'past_due')
    group by 1
    order by 2 desc;
end;
$$;

create or replace function admin_uso_por_modulo(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_resultado jsonb;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select jsonb_build_object(
    'ventas', (select count(*) from ordenes where created_at >= p_desde and created_at < p_hasta),
    'stock', (select count(*) from dispositivos where created_at >= p_desde and created_at < p_hasta),
    'reparaciones', (select count(*) from reparaciones where created_at >= p_desde and created_at < p_hasta),
    'clientes', (select count(*) from clientes where created_at >= p_desde and created_at < p_hasta)
  ) into v_resultado;
  return v_resultado;
end;
$$;

create or replace function admin_embudo()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_resultado jsonb;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  select jsonb_build_object(
    'registrados', (select count(*) from negocios),
    'paso_por_prueba', (select count(*) from negocios where fecha_fin_prueba is not null),
    'activos_pagando', (select count(*) from negocios where estado_suscripcion = 'active'),
    'con_algun_pago_aprobado', (select count(distinct negocio_id) from comprobantes_pago where estado = 'aprobado')
  ) into v_resultado;
  return v_resultado;
end;
$$;

-- ============================================================
-- 8) Centro de alertas: cada fila es una alerta accionable, con el
--    negocio al que corresponde para poder abrirlo directo.
-- ============================================================
create or replace function admin_alertas()
returns table (tipo text, severidad text, negocio_id uuid, negocio_nombre text, detalle text)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select 'prueba_por_vencer'::text, 'alta'::text, n.id, n.nombre,
           ('Prueba vence en ' || greatest(ceil(extract(epoch from (n.fecha_fin_prueba - now())) / 86400), 0)::text || ' día(s)')::text
    from negocios n
    where n.estado_suscripcion = 'trialing' and n.fecha_fin_prueba between now() and now() + interval '3 days'
    union all
    select 'prueba_por_vencer', 'media', n.id, n.nombre,
           ('Prueba vence en ' || ceil(extract(epoch from (n.fecha_fin_prueba - now())) / 86400)::text || ' día(s)')::text
    from negocios n
    where n.estado_suscripcion = 'trialing' and n.fecha_fin_prueba > now() + interval '3 days' and n.fecha_fin_prueba <= now() + interval '7 days'
    union all
    select 'pago_pendiente', 'alta', n.id, n.nombre, ('Estado de pago: ' || n.estado_suscripcion)::text
    from negocios n
    where n.estado_suscripcion in ('past_due', 'unpaid')
    union all
    select 'comprobante_pendiente', 'media', n.id, n.nombre, 'Comprobante de pago esperando revisión'::text
    from negocios n
    where exists (select 1 from comprobantes_pago c where c.negocio_id = n.id and c.estado = 'pendiente')
    union all
    select 'sin_actividad', 'media', n.id, n.nombre, 'Cuenta paga sin actividad hace más de 30 días'::text
    from negocios n
    where n.estado_suscripcion = 'active'
      and n.created_at < now() - interval '30 days'
      and not exists (select 1 from ordenes o where o.negocio_id = n.id and o.created_at >= now() - interval '30 days')
      and not exists (select 1 from dispositivos d where d.negocio_id = n.id and d.created_at >= now() - interval '30 days')
    union all
    select 'sin_configurar', 'baja', n.id, n.nombre, 'Se registró pero no cargó stock ni clientes todavía'::text
    from negocios n
    where n.created_at < now() - interval '2 days'
      and not exists (select 1 from dispositivos d where d.negocio_id = n.id)
      and not exists (select 1 from clientes c where c.negocio_id = n.id)
    order by 2 desc;
end;
$$;
