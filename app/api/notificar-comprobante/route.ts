import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

// Avisa por Telegram apenas un negocio manda un comprobante de pago
// (transferencia o USDT) — antes había que entrar a /admin/pagos a mano
// para enterarse de que había algo para revisar. Best-effort a propósito:
// si Telegram falla, no bloquea ni le muestra error al negocio que está
// pagando (su comprobante ya se guardó bien, eso es lo que importa).
export async function POST(req: NextRequest) {
  try {
    const { nombreNegocio, monto, moneda, referencia, metodo } = await req.json();

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      Sentry.captureMessage('Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID', 'error');
      return NextResponse.json({ error: 'No configurado' }, { status: 500 });
    }

    const texto =
      `💰 Nuevo comprobante de pago\n\n` +
      `Negocio: ${nombreNegocio || 'sin nombre'}\n` +
      `Monto: ${moneda || ''} ${monto ?? ''}\n` +
      `Método: ${metodo || 'sin especificar'}` +
      (referencia ? `\nReferencia: ${referencia}` : '') +
      `\n\nRevisar: https://qovento.app/admin/pagos`;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      Sentry.captureMessage(`Fallo enviando aviso de Telegram: ${detalle}`, 'error');
      return NextResponse.json({ error: 'No se pudo enviar' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
