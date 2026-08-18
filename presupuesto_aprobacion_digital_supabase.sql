-- ============================================================
-- Servicio Técnico PRO — Fase 6: aprobación digital de presupuesto
-- (sección 16 del rediseño).
--
-- Aditivo e idempotente. CORRER ESTO ANTES de que el código nuevo
-- llegue a producción: la ficha y el portal público de seguimiento
-- pasan a leer/escribir estas columnas.
-- ============================================================
alter table reparaciones add column if not exists presupuesto_estado text;
alter table reparaciones add column if not exists presupuesto_enviado_at timestamptz;
alter table reparaciones add column if not exists presupuesto_medio text;
alter table reparaciones add column if not exists presupuesto_respondido_at timestamptz;
alter table reparaciones add column if not exists presupuesto_importe_aceptado numeric;
alter table reparaciones add column if not exists presupuesto_texto_aceptado text;

-- Reemplaza seguimiento_publico para sumar los campos de presupuesto que
-- necesita el portal del cliente (Postgres no permite cambiar la forma de
-- salida de una función con "create or replace", hay que borrarla primero).
drop function if exists seguimiento_publico(uuid);

create or replace function seguimiento_publico(token uuid)
returns table (
  numero_orden text,
  modelo text,
  capacidad_gb int,
  color text,
  estado text,
  fecha_ingreso_servicio timestamptz,
  fecha_estimada date,
  fecha_reparado timestamptz,
  trabajos_realizados text[],
  nombre_cliente text,
  nombre_negocio text,
  logo_negocio text,
  evidencias jsonb,
  diagnostico text,
  presupuesto_mano_obra numeric,
  presupuesto_repuestos numeric,
  presupuesto_estado text,
  presupuesto_respondido_at timestamptz
)
language sql
security definer
stable
as $$
  select
    r.numero_orden, r.modelo, r.capacidad_gb, r.color, r.estado,
    r.fecha_ingreso_servicio, r.fecha_estimada, r.fecha_reparado, r.trabajos_realizados,
    cli.nombre,
    n.nombre, n.logo_url,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'foto_url', e.foto_url,
        'nota', e.nota,
        'created_at', e.created_at
      ) order by e.created_at asc), '[]'::jsonb)
      from reparaciones_evidencias e
      where e.reparacion_id = r.id
    ),
    r.diagnostico,
    r.presupuesto_mano_obra,
    r.presupuesto_repuestos,
    r.presupuesto_estado,
    r.presupuesto_respondido_at
  from reparaciones r
  join negocios n on n.id = r.negocio_id
  left join clientes cli on cli.id = r.cliente_id
  where r.token_seguimiento = token
$$;

grant execute on function seguimiento_publico(uuid) to anon, authenticated;

-- El cliente aprueba/rechaza desde su link de seguimiento (sin login,
-- como todo el portal público) — security definer + scoped por el token
-- exacto, mismo patrón que el resto de las funciones públicas de esta
-- base. Deja "congelado" el importe y el texto del diagnóstico que se
-- aceptó, para que un cambio posterior en el presupuesto no reescriba en
-- silencio lo que el cliente ya aprobó.
create or replace function reparacion_responder_presupuesto(p_token uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
as $$
declare
  v_rep reparaciones%rowtype;
begin
  select * into v_rep from reparaciones where token_seguimiento = p_token for update;
  if not found then
    raise exception 'No encontramos esa reparación';
  end if;
  if v_rep.presupuesto_estado = 'aprobado' or v_rep.presupuesto_estado = 'rechazado' then
    raise exception 'Este presupuesto ya fue respondido';
  end if;

  update reparaciones
  set
    presupuesto_estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
    presupuesto_medio = 'portal',
    presupuesto_respondido_at = now(),
    presupuesto_importe_aceptado = coalesce(v_rep.presupuesto_mano_obra, 0) + coalesce(v_rep.presupuesto_repuestos, 0),
    presupuesto_texto_aceptado = v_rep.diagnostico
  where id = v_rep.id;

  insert into reparaciones_eventos (negocio_id, reparacion_id, tipo, texto, actor_nombre)
  values (
    v_rep.negocio_id,
    v_rep.id,
    'sistema',
    case when p_aprobar then 'El cliente aprobó el presupuesto desde el link de seguimiento' else 'El cliente rechazó el presupuesto desde el link de seguimiento' end,
    'Cliente'
  );
end;
$$;

grant execute on function reparacion_responder_presupuesto(uuid, boolean) to anon, authenticated;
