-- ============================================================
-- Aviso de Telegram de un comprobante de pago: hacerlo confiable
-- (2026-09-12) — reportado por roque: le llegó el aviso de un pago, pero
-- no del siguiente. El envío a Telegram (app/api/notificar-comprobante)
-- siempre fue "best-effort" a propósito (nunca debía bloquear ni romper
-- el flujo de un negocio que recién pagó) — pero eso también significa
-- que si Telegram falla por lo que sea (un corte de red puntual, un
-- timeout), roque nunca se entera: queda solo en Sentry, que no revisa
-- todos los días.
--
-- Esta migración agrega una columna para poder VER esto desde /admin/pagos
-- (la pantalla que roque ya revisa para aprobar pagos) en vez de depender
-- de que el aviso de Telegram llegue sí o sí. El código además ahora
-- reintenta una vez antes de darse por vencido (ver route.ts).
-- ============================================================

alter table comprobantes_pago add column if not exists telegram_avisado boolean not null default false;

-- admin_pagos_listar: agrega telegram_avisado a lo que ya devolvía, sin
-- tocar el resto (mismo query, misma paginación).
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
  telegram_avisado boolean,
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
           c.estado, c.nota_admin, c.created_at, c.revisado_at, c.telegram_avisado, count(*) over() as total_count
    from comprobantes_pago c
    join negocios n on n.id = c.negocio_id
    where p_estado is null or p_estado = '' or c.estado = p_estado
    order by c.created_at desc
    limit p_por_pagina offset v_offset;
end;
$$;
