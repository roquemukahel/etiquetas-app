-- ============================================================
-- Panel Admin: historial de comprobantes por negocio (aprobados y
-- rechazados, no solo los pendientes). admin_aprobar_pago/admin_rechazar_pago
-- nunca borraron la fila del comprobante (solo cambian su "estado"), pero el
-- panel únicamente tenía admin_listar_comprobantes_pendientes(), que filtra
-- por estado = 'pendiente' — una vez aprobado o rechazado, el comprobante
-- pasaba a no poder verse nunca más desde /admin (parecía "desaparecer",
-- aunque los datos siguen intactos en comprobantes_pago).
--
-- Aditivo: solo agrega una función nueva, no toca las que ya existían.
-- Correr en Supabase > SQL Editor > Run.
-- ============================================================

create or replace function admin_listar_comprobantes(negocio_id_param uuid)
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
  revisado_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select c.id, c.negocio_id, n.nombre, c.monto, c.moneda, c.comprobante_imagen, c.referencia,
           c.estado, c.nota_admin, c.created_at, c.revisado_at
    from comprobantes_pago c
    join negocios n on n.id = c.negocio_id
    where c.negocio_id = negocio_id_param
    order by c.created_at desc;
end;
$$;
