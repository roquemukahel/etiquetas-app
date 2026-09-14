-- ============================================================
-- Aviso de Telegram de un comprobante de pago: que salga SIEMPRE,
-- sin depender del navegador del cliente
-- (2026-09-14) — roque reportó (por cuarta o quinta vez) que el aviso
-- sigue fallando de forma intermitente: a veces llega, a veces no, a
-- veces llega una vez y después nunca más.
--
-- La causa real: hasta ahora, el aviso lo disparaba un fetch desde el
-- NAVEGADOR del negocio que acababa de pagar (PagoTransferenciaARS.tsx /
-- PagoUSDT.tsx), después de guardar el comprobante. Ese fetch es
-- "fire-and-forget" — si el negocio cierra la pestaña o la app apenas
-- termina de subir la foto del comprobante (algo carrera normal: "ya
-- mandé el comprobante, listo"), el navegador puede cortar ese pedido
-- ANTES de que llegue a salir. El reintento agregado en la migración
-- anterior (telegram_avisado_retry_supabase.sql) no soluciona esto: un
-- reintento dentro de un pedido que nunca llegó a salir no sirve de nada.
--
-- La solución de fondo: que el aviso lo dispare la BASE DE DATOS misma,
-- apenas se guarda la fila — no el navegador del cliente. Un trigger de
-- Postgres con pg_net corre en el servidor de Supabase, totalmente
-- independiente de si el cliente cierra la pestaña, se queda sin señal,
-- etc. Si el insert del comprobante ya se guardó (que es justamente lo
-- único de lo que el negocio depende para ver "tu comprobante está en
-- revisión"), el aviso SIEMPRE se intenta mandar.
--
-- El endpoint /api/notificar-comprobante no cambia (sigue reintentando
-- una vez y marcando telegram_avisado) — solo cambia QUIÉN lo llama.
-- El fetch desde PagoTransferenciaARS.tsx/PagoUSDT.tsx se sacó del
-- código (ver commit) para no mandar el aviso dos veces.
-- ============================================================

create extension if not exists pg_net;

create or replace function notificar_comprobante_pago()
returns trigger
language plpgsql
security definer
as $$
declare
  v_nombre_negocio text;
  v_metodo text;
begin
  select nombre into v_nombre_negocio from negocios where id = new.negocio_id;
  v_metodo := case when new.moneda = 'USDT' then 'USDT (cripto)' else 'Transferencia (' || new.moneda || ')' end;

  perform net.http_post(
    url := 'https://www.qovento.app/api/notificar-comprobante',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'nombreNegocio', v_nombre_negocio,
      'monto', new.monto,
      'moneda', new.moneda,
      'referencia', new.referencia,
      'metodo', v_metodo,
      'comprobanteId', new.id
    ),
    timeout_milliseconds := 8000
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_comprobante_pago on comprobantes_pago;
create trigger trg_notificar_comprobante_pago
  after insert on comprobantes_pago
  for each row
  execute function notificar_comprobante_pago();
