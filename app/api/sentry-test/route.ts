import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export async function GET() {
  Sentry.captureException(new Error('Prueba de Sentry desde Qovento'));
  await Sentry.flush(2000);
  return NextResponse.json({ ok: true });
}
