-- ============================================================
-- Corregir a mano el monto/moneda de un comprobante de pago
-- (2026-09-12) — reportado por roque: un cliente pagó el plan anual pero
-- el comprobante quedó cargado con el monto del mensual (o viceversa).
-- La activación de la cuenta queda bien igual (se elige el plan y los
-- días al aprobar), pero el monto guardado en comprobantes_pago queda
-- mal — y ese es el número que se suma en "Ingresos cobrados" en
-- /admin. Sin forma de corregirlo, ese reporte queda mintiendo para
-- siempre sobre ese pago puntual.
--
-- comprobantes_pago no permite UPDATE directo ni siquiera al propio
-- negocio (ver schema.sql) — todo cambio pasa por una función
-- security definer de admin, como admin_aprobar_pago/admin_rechazar_pago.
-- Esta agrega la misma vía para corregir monto/moneda, sin tocar estado
-- ni fechas, y deja auditoría de qué valor tenía antes.
-- ============================================================

create or replace function admin_editar_pago(comprobante_id uuid, nuevo_monto numeric, nueva_moneda text default null)
returns void
language plpgsql
security definer
as $$
declare
  neg_id uuid;
  v_monto_anterior numeric;
  v_moneda_anterior text;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  if nuevo_monto is null or nuevo_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a 0';
  end if;

  select negocio_id, monto, moneda into neg_id, v_monto_anterior, v_moneda_anterior
    from comprobantes_pago where id = comprobante_id;
  if neg_id is null then
    raise exception 'Comprobante no encontrado';
  end if;

  update comprobantes_pago
    set monto = nuevo_monto,
        moneda = coalesce(nullif(trim(nueva_moneda), ''), moneda)
    where id = comprobante_id;

  perform admin_registrar_accion(neg_id, 'corrigió el monto de un pago', 'comprobante_pago', comprobante_id,
    jsonb_build_object('monto', v_monto_anterior, 'moneda', v_moneda_anterior),
    jsonb_build_object('monto', nuevo_monto, 'moneda', coalesce(nullif(trim(nueva_moneda), ''), v_moneda_anterior)),
    null);
end;
$$;
