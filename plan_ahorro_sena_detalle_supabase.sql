-- ============================================================
-- PLAN DE AHORRO / SEÑA: el comprobante no mostraba el IMEI ni el detalle
-- del equipo señado (2026-09-09) — pedido real de un cliente, relayado
-- por roque.
--
-- planes_ahorro.dispositivo_id apunta al equipo puntual reservado, pero el
-- IMEI vive solo en `dispositivos` (nunca se copió a planes_ahorro) — el
-- comprobante interno y el público arman su "Plan de ahorro" únicamente
-- con modelo/capacidad/color del PLAN, así que nunca mostraban de qué
-- unidad puntual se trataba (dos equipos idénticos de un mismo modelo/
-- color eran indistinguibles en el papel) ni las condiciones acordadas
-- (planes_ahorro.detalles).
--
-- Se actualiza el RPC del comprobante público para sumar imei y detalles
-- (el comprobante interno los trae con un join normal, sin necesitar SQL).
-- ============================================================

create or replace function comprobante_plan_ahorro_publico(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', m.id,
    'monto', m.monto,
    'medio', m.medio,
    'observacion', m.observacion,
    'fecha', m.fecha,
    'registrado_por_nombre', m.registrado_por_nombre,
    'anulado', m.anulado,
    'plan', jsonb_build_object(
      'id', p.id,
      'modelo', p.modelo,
      'capacidad_gb', p.capacidad_gb,
      'color', p.color,
      'monto_objetivo', p.monto_objetivo,
      'detalles', p.detalles,
      'imei', d.imei
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_declaracion_plan_ahorro', n.texto_declaracion_plan_ahorro,
      'texto_declaracion_plan_ahorro_tamano', n.texto_declaracion_plan_ahorro_tamano
    ),
    'total_pagado', (
      select coalesce(sum(m2.monto), 0)
      from plan_ahorro_movimientos m2
      where m2.plan_id = p.id and not m2.anulado
    )
  )
  from plan_ahorro_movimientos m
  join planes_ahorro p on p.id = m.plan_id
  join negocios n on n.id = m.negocio_id
  left join clientes cli on cli.id = p.cliente_id
  left join dispositivos d on d.id = p.dispositivo_id
  where m.token_publico = token
$$;

grant execute on function comprobante_plan_ahorro_publico(uuid) to anon, authenticated;
