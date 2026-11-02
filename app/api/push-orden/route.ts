import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  armarMensajesPush,
  ESTADOS_QUE_AVISAN,
  ESTADOS_QUE_CIERRAN,
  estadoPublico,
  textoPush,
  tokensNoRegistrados,
} from '../../lib/ordenPublica';

// Manda el aviso push (Expo) al cliente cuando cambia el estado de su orden de Servicio Técnico.
// Lo llama la base de datos (disparador de orden_publica_supabase.sql, con pg_net) apenas se guarda el cambio, así que sale
// aunque nadie tenga Qovento abierto. No necesita secreto: el cuerpo solo trae el id de la orden y TODO lo demás (estado,
// tokens, textos) se lee de la base; además cada estado se avisa una sola vez (reparacion_reclamar_aviso), de modo que
// repetir el pedido no manda avisos de más.
export const dynamic = 'force-dynamic';

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let id: unknown = null;
  try {
    id = ((await req.json()) as { reparacion_id?: unknown } | null)?.reparacion_id;
  } catch {
    return NextResponse.json({ error: 'pedido_invalido' }, { status: 400 });
  }
  if (typeof id !== 'string' || !FORMATO_UUID.test(id)) return NextResponse.json({ error: 'pedido_invalido' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    Sentry.captureMessage('Push de orden: falta configuración de Supabase en el servidor', 'error');
    return NextResponse.json({ error: 'servicio_no_disponible' }, { status: 500 });
  }

  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  let reclamado = false;
  try {
    // Marca el estado actual como "ya avisado". Si no devuelve nada, ese estado ya se avisó: no hay nada más que hacer.
    const { data: estadoReclamado, error: errorReclamo } = await supabase.rpc('reparacion_reclamar_aviso', { p_id: id });
    if (errorReclamo) throw errorReclamo;
    if (!estadoReclamado) return NextResponse.json({ ok: true, avisados: 0 });
    reclamado = true;

    const estado = estadoPublico(estadoReclamado as string);
    const cierra = ESTADOS_QUE_CIERRAN.includes(estado);

    let avisados = 0;
    if (ESTADOS_QUE_AVISAN.includes(estado)) {
      const [{ data: orden, error: errorOrden }, { data: filas, error: errorTokens }] = await Promise.all([
        supabase.from('reparaciones').select('codigo_seguimiento, modelo, negocio_id').eq('id', id).maybeSingle(),
        supabase.from('reparaciones_push_tokens').select('token').eq('reparacion_id', id),
      ]);
      if (errorOrden) throw errorOrden;
      if (errorTokens) throw errorTokens;
      const tokens = (filas ?? []).map((f) => f.token as string);

      if (orden && tokens.length > 0) {
        const { data: negocio, error: errorNegocio } = await supabase.from('negocios').select('nombre, direccion').eq('id', orden.negocio_id).maybeSingle();
        if (errorNegocio) throw errorNegocio;
        const texto = textoPush(estado, orden.modelo, { nombre: negocio?.nombre ?? '', direccion: negocio?.direccion ?? null });
        if (texto) {
          const respuesta = await fetch(URL_EXPO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(armarMensajesPush(tokens, orden.codigo_seguimiento, estado, texto)),
          });
          if (!respuesta.ok) throw new Error(`Expo respondió ${respuesta.status}`);
          avisados = tokens.length;

          // Los equipos que desinstalaron la app ya no sirven: se borran sus tokens.
          const invalidos = tokensNoRegistrados(tokens, await respuesta.json().catch(() => null));
          // Son 10 como máximo por orden: se borran de a uno.
          const borrados = await Promise.all(invalidos.map((t) => supabase.from('reparaciones_push_tokens').delete().eq('reparacion_id', id).eq('token', t)));
          for (const b of borrados) if (b.error) Sentry.captureException(b.error);
        }
      }
    }

    // Al llegar a entregado o cancelado se deja de avisar: se borran todos los tokens de la orden.
    if (cierra) {
      const { error: errorCierre } = await supabase.from('reparaciones_push_tokens').delete().eq('reparacion_id', id);
      if (errorCierre) Sentry.captureException(errorCierre);
    }

    return NextResponse.json({ ok: true, avisados });
  } catch (e) {
    Sentry.captureException(e);
    // Si el envío falló, se deshace el "ya avisado" para que un reintento pueda volver a mandarlo.
    if (reclamado) {
      const { error } = await supabase.from('reparaciones').update({ push_estado_avisado: null }).eq('id', id);
      if (error) Sentry.captureException(error);
    }
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
