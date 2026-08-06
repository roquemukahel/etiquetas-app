-- ============================================================
-- QOVENTO — Aclaraciones del técnico en la boleta (incluir sí/no)
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
--
-- ordenes.aclaraciones_tecnico ya existe (servicio_conexion_supabase.sql).
-- Acá se suma el flag para que el vendedor decida, desde Órdenes, si esas
-- aclaraciones salen o no impresas en la boleta. Y la boleta pública (link de
-- WhatsApp) tiene que devolver esos dos campos.
-- ============================================================

alter table ordenes add column if not exists incluir_aclaraciones_tecnico boolean not null default true;

create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
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
        'garantia_vencimiento', d.garantia_vencimiento
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
