-- ============================================================
-- QOVENTO — Portal de autoconsulta de cuenta corriente del cliente
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que
-- quieras (aditivo; el backfill del token solo toca clientes sin token).
--
-- Da a cada cliente un "token" secreto (un código imposible de adivinar) y
-- una función pública que, con ese token, devuelve SOLO la cuenta de ese
-- cliente. Mismo patrón que el seguimiento público de Servicio Técnico:
-- el cliente entra a un link y ve su saldo y movimientos, sin cuenta ni
-- contraseña, y sin poder ver nada de otro cliente.
-- ============================================================

-- Token secreto por cliente (uno random por cliente).
alter table clientes add column if not exists portal_token uuid;
update clientes set portal_token = gen_random_uuid() where portal_token is null;
alter table clientes alter column portal_token set default gen_random_uuid();

-- Función pública: con el token, devuelve la cuenta de ese cliente (datos
-- del negocio, saldo y movimientos). security definer para poder leer sin
-- login, pero SOLO la fila cuyo token coincide — nunca la de otro.
create or replace function cuenta_publica(token uuid)
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'nombre', c.nombre,
    'apellido', c.apellido,
    'negocio', n.nombre,
    'logo', n.logo_url,
    'moneda', n.moneda,
    'saldo', coalesce((
      select sum(case when m.tipo = 'cargo' then m.monto else -m.monto end)
      from cta_cte_movimientos m
      where m.cliente_id = c.id and not m.anulado
    ), 0),
    'movimientos', coalesce((
      select json_agg(json_build_object(
        'tipo', m.tipo,
        'concepto', m.concepto,
        'monto', m.monto,
        'vencimiento', m.vencimiento,
        'observacion', m.observacion,
        'fecha', m.fecha
      ) order by m.fecha desc)
      from cta_cte_movimientos m
      where m.cliente_id = c.id and not m.anulado
    ), '[]'::json)
  )
  from clientes c
  join negocios n on n.id = c.negocio_id
  where c.portal_token = token
$$;

-- Permitir que un visitante anónimo (sin login) pueda llamar a la función.
grant execute on function cuenta_publica(uuid) to anon, authenticated;
