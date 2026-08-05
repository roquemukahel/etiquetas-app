-- ============================================================
-- QOVENTO — Moneda de la boleta (cómo se MUESTRA el monto)
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
--
-- La orden SIEMPRE queda en la moneda principal del negocio (el dólar),
-- por lo que las Estadísticas siguen siendo siempre en dólares. Este
-- campo solo cambia cómo se muestra el monto en la BOLETA:
--   'principal' (o vacío) -> solo en la moneda principal (US$)
--   'secundaria'          -> solo en la otra moneda (pesos), convertido
--   'ambas'               -> en las dos monedas
-- El monto en la otra moneda se guarda en monto_secundario/moneda_secundaria
-- (ya existentes), calculado con el tipo de cambio del negocio.
-- ============================================================

alter table ordenes add column if not exists boleta_moneda text;

-- La boleta pública (link de WhatsApp) tiene que devolver también este campo.
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
