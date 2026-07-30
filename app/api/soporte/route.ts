import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

const EMAIL_DESTINO = 'qovento@gmail.com';

export async function POST(req: NextRequest) {
  try {
    const { nombre, apellido, contacto, mensaje } = await req.json();

    if (!nombre?.trim() || !mensaje?.trim()) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      Sentry.captureMessage('Falta RESEND_API_KEY', 'error');
      return NextResponse.json({ error: 'No configurado' }, { status: 500 });
    }

    const contactoLimpio = (contacto ?? '').trim();
    const contactoEsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactoLimpio);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Qovento Soporte <onboarding@resend.dev>',
        to: EMAIL_DESTINO,
        ...(contactoEsEmail ? { reply_to: contactoLimpio } : {}),
        subject: `Nuevo mensaje de soporte — ${nombre} ${apellido || ''}`.trim(),
        text: `Nombre: ${nombre} ${apellido || ''}\nContacto: ${contactoLimpio || 'no dejó'}\n\nMensaje:\n${mensaje}`,
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      Sentry.captureMessage(`Fallo enviando mail de soporte: ${detalle}`, 'error');
      return NextResponse.json({ error: 'No se pudo enviar' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
