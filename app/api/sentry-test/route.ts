import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';
  const client = Sentry.getClient();

  Sentry.captureException(new Error('Prueba de Sentry desde Qovento'));
  const enviado = await Sentry.flush(3000);

  return NextResponse.json({
    dsnPresente: !!dsn,
    dsnLargo: dsn.length,
    dsnEmpieza: dsn.slice(0, 12),
    dsnTermina: dsn.slice(-6),
    clienteInicializado: !!client,
    eventoEnviado: enviado,
  });
}
