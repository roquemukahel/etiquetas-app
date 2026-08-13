import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

const EMAIL_DESTINO = 'qovento@gmail.com';

export async function POST(req: NextRequest) {
  try {
    const { nombre, apellido, email, telefono, mensaje } = await req.json();

    const emailLimpio = (email ?? '').trim();
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio);
    if (!nombre?.trim() || !emailValido || !mensaje?.trim()) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      Sentry.captureMessage('Falta RESEND_API_KEY', 'error');
      return NextResponse.json({ error: 'No configurado' }, { status: 500 });
    }

    const telefonoLimpio = (telefono ?? '').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Qovento Soporte <onboarding@resend.dev>',
        to: EMAIL_DESTINO,
        reply_to: emailLimpio,
        subject: `Nuevo mensaje de soporte — ${nombre} ${apellido || ''}`.trim(),
        text: `Nombre: ${nombre} ${apellido || ''}\nEmail: ${emailLimpio}\nTeléfono: ${telefonoLimpio || 'no dejó'}\n\nMensaje:\n${mensaje}`,
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
