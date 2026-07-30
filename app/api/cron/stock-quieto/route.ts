import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

// Vercel Cron manda automáticamente "Authorization: Bearer <CRON_SECRET>"
// cuando la variable de entorno CRON_SECRET está configurada. Así nos
// aseguramos de que nadie más pueda disparar este endpoint a mano.
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

    const hace30dias = new Date();
    hace30dias.setDate(hace30dias.getDate() - 30);

    const { data: dispositivos, error } = await supabase
      .from('dispositivos')
      .select('id, modelo, imei, negocio_id, en_stock_desde')
      .eq('en_stock', true)
      .eq('alerta_stock_enviada', false)
      .lte('en_stock_desde', hace30dias.toISOString());

    if (error) throw error;
    if (!dispositivos || dispositivos.length === 0) {
      return NextResponse.json({ ok: true, negociosAvisados: 0 });
    }

    const porNegocio = new Map<string, typeof dispositivos>();
    for (const d of dispositivos) {
      const lista = porNegocio.get(d.negocio_id) ?? [];
      lista.push(d);
      porNegocio.set(d.negocio_id, lista);
    }

    const apiKey = process.env.RESEND_API_KEY;
    let negociosAvisados = 0;

    for (const [negocioId, lista] of porNegocio) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('id')
        .eq('negocio_id', negocioId)
        .limit(1)
        .single();
      if (!perfil) continue;

      const { data: userData } = await supabase.auth.admin.getUserById(perfil.id);
      const email = userData?.user?.email;
      const idsDispositivos = lista.map((d) => d.id);

      if (email && apiKey) {
        const listaTexto = lista.map((d) => `- ${d.modelo || 'Sin modelo'}${d.imei ? ` (IMEI ${d.imei})` : ''}`).join('\n');

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Qovento <onboarding@resend.dev>',
            to: email,
            subject: `Tenés ${lista.length} equipo(s) hace más de 30 días en stock`,
            text: `Hola! Estos equipos llevan más de 30 días sin venderse:\n\n${listaTexto}\n\nRevisalos en tu panel de Stock por si conviene bajarles el precio o revisar qué pasa con ellos.`,
          }),
        });

        if (res.ok) negociosAvisados++;
        else Sentry.captureMessage(`Fallo mail stock quieto negocio ${negocioId}: ${await res.text()}`, 'error');
      }

      // Marcamos como avisados aunque no tengamos mail (para no reintentar
      // sin parar); si el dueño agrega el mail más adelante, el próximo
      // dispositivo que cruce los 30 días sí le va a llegar.
      await supabase.from('dispositivos').update({ alerta_stock_enviada: true }).in('id', idsDispositivos);
    }

    return NextResponse.json({ ok: true, negociosAvisados });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
