-- ============================================================
-- NUMERACIÓN DE FACTURAS/BOLETAS DE VENTA (2026-08-27) — pedido del mismo
-- cliente que pidió el módulo Caja: "que cada boleta me vaya siendo
-- enumerada". `ordenes` no tenía nada parecido a lo que reparaciones ya
-- tiene con `numero_orden`/`siguiente_numero_reparacion()` — este archivo
-- es exactamente ese mismo patrón (contador atómico por negocio, con
-- lock de fila vía UPDATE...RETURNING para que dos ventas al mismo
-- instante nunca reciban el mismo número), aplicado a ventas.
-- ============================================================

alter table negocios add column if not exists contador_ordenes int not null default 0;
alter table ordenes add column if not exists numero_orden text;
create unique index if not exists uq_ordenes_numero_orden on ordenes(negocio_id, numero_orden) where numero_orden is not null;

create or replace function siguiente_numero_orden(neg_id uuid)
returns text
language plpgsql
as $$
declare
  nuevo_numero int;
begin
  update negocios
  set contador_ordenes = contador_ordenes + 1
  where id = neg_id
  returning contador_ordenes into nuevo_numero;

  return 'F-' || lpad(nuevo_numero::text, 6, '0');
end;
$$;

create or replace function asignar_numero_orden()
returns trigger
language plpgsql
as $$
begin
  if new.numero_orden is null then
    new.numero_orden := siguiente_numero_orden(new.negocio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_numero_orden on ordenes;
create trigger trigger_numero_orden
  before insert on ordenes
  for each row
  execute function asignar_numero_orden();

-- Numera también las órdenes que ya existen, en orden cronológico real
-- (created_at), para que la numeración respete cuándo pasó cada venta de
-- verdad en vez de asignarse en un orden arbitrario. Segura de re-correr:
-- solo toca las filas que todavía no tienen número.
do $$
declare
  r record;
begin
  for r in
    select id, negocio_id
    from ordenes
    where numero_orden is null
    order by negocio_id, created_at asc
  loop
    update ordenes set numero_orden = siguiente_numero_orden(r.negocio_id) where id = r.id;
  end loop;
end $$;

-- boleta_publica (RPC de la boleta pública, /boleta/[token]) no traía
-- numero_orden — se redefine completa con el mismo cuerpo que ya tiene en
-- producción (compras_color_condicion_supabase.sql, la versión vigente
-- más reciente) más ese único campo nuevo.
create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'numero_orden', o.numero_orden,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'estado', o.estado,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', coalesce(o.moneda, n.moneda),
    'monto_secundario', o.monto_secundario,
    'moneda_secundaria', o.moneda_secundaria,
    'boleta_moneda', o.boleta_moneda,
    'aclaraciones_tecnico', o.aclaraciones_tecnico,
    'incluir_aclaraciones_tecnico', o.incluir_aclaraciones_tecnico,
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canjes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', c.modelo,
        'capacidad_gb', c.capacidad_gb,
        'color', c.color,
        'imei', c.imei,
        'salud_bateria', c.salud_bateria,
        'detalles', c.detalles,
        'monto', c.monto
      ) order by c.created_at), '[]'::jsonb)
      from canjes c
      where c.orden_id = o.id and c.estado = 'en_canje'
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento,
        'estado_dispositivo', d.estado
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  where o.token_boleta = token
$$;

grant execute on function boleta_publica(uuid) to anon, authenticated;
