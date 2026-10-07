import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

// Foto mensual del inventario a costo de todos los negocios (ver
// inventario_tomar_foto en compra_contado_rubros_supabase.sql). Vercel Cron la
// dispara el día 1 de cada mes y manda "Authorization: Bearer <CRON_SECRET>".
function autorizado(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return req.headers.get('authorization') === `Bearer ${secreto}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase.rpc('inventario_tomar_foto');
    if (error) throw error;
    return NextResponse.json({ ok: true, filas: data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
