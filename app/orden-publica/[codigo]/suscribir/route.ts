import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { ipDeLaPeticion, segundosParaReintentar, superaElLimite } from '../../../lib/limiteConsultas';
import {
  CABECERAS_ORDEN_PUBLICA,
  ESTADOS_QUE_CIERRAN,
  esTokenExpoValido,
  estadoPublico,
  MAX_TOKENS_PUSH_POR_ORDEN,
  normalizarCodigo,
} from '../../../lib/ordenPublica';

// Suscribe un celular a los avisos de una orden: POST /orden-publica/<código>/suscribir  { "token": "ExponentPushToken[...]" }
// Guarda el token en la orden. Cuando la orden cambia de estado, /api/push-orden manda el aviso (ver orden_publica_supabase.sql).
// Se guardan como mucho los últimos 10 tokens por orden (un cliente que reinstala la app genera uno nuevo).
export const dynamic = 'force-dynamic';

const respuesta = (cuerpo: unknown, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json(cuerpo, { status, headers: { ...CABECERAS_ORDEN_PUBLICA, Vary: 'Accept', ...extra } });

export function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CABECERAS_ORDEN_PUBLICA });
}

export async function POST(req: Request, { params }: { params: { codigo: string } }) {
  const codigo = normalizarCodigo(params.codigo);
  if (!codigo) return respuesta({ ok: false, error: 'no_encontrada' }, 404);

  let cuerpo: unknown = null;
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta({ ok: false, error: 'token_invalido' }, 400);
  }
  const token = (cuerpo as { token?: unknown } | null)?.token;
  if (!esTokenExpoValido(token)) return respuesta({ ok: false, error: 'token_invalido' }, 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    Sentry.captureMessage('Orden pública suscribir: falta configuración de Supabase en el servidor', 'error');
    return respuesta({ ok: false, error: 'servicio_no_disponible' }, 500);
  }

  try {
    const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

    if (await superaElLimite(supabase, `orden:${ipDeLaPeticion(req.headers)}`)) {
      return respuesta({ ok: false, error: 'demasiadas_consultas' }, 429, { 'Retry-After': String(segundosParaReintentar()) });
    }

    const { data: orden, error } = await supabase.from('reparaciones').select('id, estado').eq('codigo_seguimiento', codigo).maybeSingle();
    if (error) throw error;
    if (!orden) return respuesta({ ok: false, error: 'no_encontrada' }, 404);
    // Una orden entregada o cancelada ya no avisa: no tiene sentido guardar el token.
    if (ESTADOS_QUE_CIERRAN.includes(estadoPublico(orden.estado))) return respuesta({ ok: false, error: 'orden_cerrada' }, 409);

    const { data: existentes, error: errorLectura } = await supabase
      .from('reparaciones_push_tokens')
      .select('id, token, created_at')
      .eq('reparacion_id', orden.id)
      .order('created_at', { ascending: true });
    if (errorLectura) throw errorLectura;

    const actuales = existentes ?? [];
    if (!actuales.some((t) => t.token === token)) {
      // Si ya hay 10, se borran los más viejos para dejar lugar al nuevo.
      const sobran = actuales.length - (MAX_TOKENS_PUSH_POR_ORDEN - 1);
      if (sobran > 0) {
        // Son 10 como máximo: se borran de a uno.
        const resultados = await Promise.all(actuales.slice(0, sobran).map((t) => supabase.from('reparaciones_push_tokens').delete().eq('id', t.id)));
        const fallo = resultados.find((r) => r.error);
        if (fallo?.error) throw fallo.error;
      }
      const { error: errorInsert } = await supabase.from('reparaciones_push_tokens').insert({ reparacion_id: orden.id, token });
      // 23505 = otro pedido idéntico llegó justo antes: el token ya está guardado, que es lo que se quería.
      if (errorInsert && errorInsert.code !== '23505') throw errorInsert;
    }

    return respuesta({ ok: true }, 200);
  } catch (e) {
    Sentry.captureException(e);
    return respuesta({ ok: false, error: 'error_interno' }, 500);
  }
}
