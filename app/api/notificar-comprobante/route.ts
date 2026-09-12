import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Avisa por Telegram apenas un negocio manda un comprobante de pago
// (transferencia o USDT) — antes había que entrar a /admin/pagos a mano
// para enterarse de que había algo para revisar. Best-effort a propósito:
// si Telegram falla, no bloquea ni le muestra error al negocio que está
// pagando (su comprobante ya se guardó bien, eso es lo que importa).
//
// Reportado por roque (2026-09-12): le llegó el aviso de un pago pero no
// del siguiente — un corte de red puntual con Telegram, invisible salvo
// que se revise Sentry. Dos cambios para que esto no dependa de que
// Telegram responda a la primera:
//   1. Reintenta UNA vez (con una pausa corta) antes de darse por vencido.
//   2. Si se pasa `comprobanteId`, marca comprobantes_pago.telegram_avisado
//      cuando el envío sale bien — así /admin/pagos (que roque ya revisa
//      para aprobar pagos) puede mostrar si el aviso llegó o no, sin
//      depender de que Telegram avise de verdad para enterarse.
async function enviarATelegram(token: string, chatId: string, texto: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (res.ok) return { ok: true as const };
  return { ok: false as const, detalle: await res.text() };
}

export async function POST(req: NextRequest) {
  try {
    const { nombreNegocio, monto, moneda, referencia, metodo, comprobanteId } = await req.json();

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

    let resultado = await enviarATelegram(token, chatId, texto);
    if (!resultado.ok) {
      // Un solo reintento, con una pausa corta — cubre el caso típico de
      // un timeout/corte de red puntual, sin convertir esto en una cola de
      // reintentos ni demorar demasiado la respuesta al negocio que pagó.
      await new Promise((r) => setTimeout(r, 1500));
      resultado = await enviarATelegram(token, chatId, texto);
    }

    if (!resultado.ok) {
      Sentry.captureMessage(`Fallo enviando aviso de Telegram (con reintento): ${resultado.detalle}`, 'error');
      return NextResponse.json({ error: 'No se pudo enviar' }, { status: 500 });
    }

    // Best-effort: si esto falla, el aviso YA llegó a Telegram (lo que
    // importa) — no hay que reportarle un error al negocio por un problema
    // de marcado interno que no le pertenece a él.
    if (comprobanteId) {
      try {
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        await supabaseAdmin.from('comprobantes_pago').update({ telegram_avisado: true }).eq('id', comprobanteId);
      } catch (err) {
        Sentry.captureException(err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
