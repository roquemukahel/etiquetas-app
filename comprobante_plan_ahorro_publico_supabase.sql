-- Comprobante de Plan de ahorro compartible por WhatsApp: mismo mecanismo
-- que ya existía para las boletas de Órdenes (token_boleta + boleta_publica),
-- aplicado a los pagos de Plan de ahorro. El token es público a propósito
-- (por eso el RPC se ejecuta con "security definer" y solo expone estos
-- campos, nunca toda la fila) — así el cliente puede abrir el link sin
-- iniciar sesión.

alter table plan_ahorro_movimientos add column if not exists token_publico uuid not null default gen_random_uuid();

create unique index if not exists plan_ahorro_movimientos_token_publico_idx on plan_ahorro_movimientos(token_publico);

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
      'monto_objetivo', p.monto_objetivo
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
  where m.token_publico = token
$$;

grant execute on function comprobante_plan_ahorro_publico(uuid) to anon, authenticated;
