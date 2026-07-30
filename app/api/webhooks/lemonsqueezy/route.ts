import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Traduce el estado que manda Lemon Squeezy al que usamos en negocios.estado_suscripcion
const MAPA_ESTADO: Record<string, string> = {
  on_trial: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'unpaid',
  cancelled: 'cancelled',
  expired: 'expired',
  paused: 'paused',
};

export async function POST(req: NextRequest) {
  try {
    return await procesarWebhook(req);
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

async function procesarWebhook(req: NextRequest) {
  const rawBody = await req.text();
  const firmaRecibida = req.headers.get('x-signature') || '';

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage('Falta LEMONSQUEEZY_WEBHOOK_SECRET', 'error');
    return NextResponse.json({ error: 'No configurado' }, { status: 500 });
  }

  const firmaEsperada = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const bufferRecibido = Buffer.from(firmaRecibida, 'utf8');
  const bufferEsperado = Buffer.from(firmaEsperada, 'utf8');

  if (bufferRecibido.length !== bufferEsperado.length || !crypto.timingSafeEqual(bufferRecibido, bufferEsperado)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const negocioId = payload.meta?.custom_data?.negocio_id;

  if (!negocioId) {
    // Puede pasar en eventos que no vienen de un checkout con nuestro custom_data.
    return NextResponse.json({ ok: true, ignorado: 'sin negocio_id' });
  }

  // Solo actuamos sobre el recurso "subscriptions" (created/updated/cancelled/
  // resumed/expired/paused traen el estado ahí). Los eventos de factura
  // (subscription_payment_success/failed) disparan también un
  // subscription_updated con el estado ya reflejado, así que no hace falta
  // procesarlos por separado.
  if (payload.data?.type !== 'subscriptions') {
    return NextResponse.json({ ok: true, ignorado: 'evento no relevante' });
  }

  const atributos = payload.data.attributes ?? {};
  const nuevoEstado = MAPA_ESTADO[atributos.status] ?? null;

  if (!nuevoEstado) {
    return NextResponse.json({ ok: true, ignorado: 'estado desconocido' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('negocios')
    .update({
      estado_suscripcion: nuevoEstado,
      lemonsqueezy_subscription_id: String(payload.data.id ?? ''),
      lemonsqueezy_customer_id: atributos.customer_id ? String(atributos.customer_id) : null,
    })
    .eq('id', negocioId);

  if (error) {
    Sentry.captureException(error, { extra: { negocioId } });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
