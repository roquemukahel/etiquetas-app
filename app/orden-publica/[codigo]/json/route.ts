import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { ipDeLaPeticion, segundosParaReintentar, superaElLimite } from '../../../lib/limiteConsultas';
import {
  armarOrdenPublicaJson,
  CABECERAS_ORDEN_PUBLICA,
  normalizarCodigo,
  type FilaHistorialEstado,
  type FilaOrdenPublica,
} from '../../../lib/ordenPublica';

// Seguimiento de una orden de Servicio Técnico para otra app: GET /orden-publica/<código>/json
//
// Público y sin sesión: el código de 8 caracteres (impreso en el ticket) es el único dato que hace falta. Se lee con la clave
// de servicio, así que todo está acotado acá: se busca la orden por su código y se piden únicamente las columnas que ve el
// cliente (sin datos personales, IMEI, código de desbloqueo, costos ni notas internas). Tope de 60 consultas por minuto por IP.
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, negocio_id, modelo, color, estado, trabajo_recomendado, trabajos_realizados, falla_declarada, nota_cliente, presupuesto_mano_obra, presupuesto_repuestos, importe_total, seguimiento_actualizado_at, estado_actualizado_at, created_at';

const respuesta = (cuerpo: unknown, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json(cuerpo, { status, headers: { ...CABECERAS_ORDEN_PUBLICA, Vary: 'Accept', ...extra } });

// La app que lee desde un navegador de otro dominio pregunta antes con OPTIONS (preflight).
export function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CABECERAS_ORDEN_PUBLICA });
}

export async function GET(req: Request, { params }: { params: { codigo: string } }) {
  const codigo = normalizarCodigo(params.codigo);
  if (!codigo) return respuesta({ error: 'no_encontrada' }, 404);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    Sentry.captureMessage('Orden pública JSON: falta configuración de Supabase en el servidor', 'error');
    return respuesta({ error: 'servicio_no_disponible' }, 500);
  }

  try {
    const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

    if (await superaElLimite(supabase, `orden:${ipDeLaPeticion(req.headers)}`)) {
      return respuesta({ error: 'demasiadas_consultas' }, 429, { 'Retry-After': String(segundosParaReintentar()) });
    }

    const { data: orden, error } = await supabase.from('reparaciones').select(COLUMNAS).eq('codigo_seguimiento', codigo).maybeSingle();
    if (error) throw error;
    if (!orden) return respuesta({ error: 'no_encontrada' }, 404);

    const [{ data: negocio, error: errorNegocio }, { data: historial, error: errorHistorial }] = await Promise.all([
      supabase.from('negocios').select('moneda').eq('id', orden.negocio_id).maybeSingle(),
      supabase.from('reparaciones_estados_historial').select('estado, created_at').eq('reparacion_id', orden.id).order('created_at', { ascending: true }),
    ]);
    if (errorNegocio) throw errorNegocio;
    if (errorHistorial) throw errorHistorial;

    return respuesta(
      armarOrdenPublicaJson(codigo, orden as FilaOrdenPublica, negocio?.moneda ?? 'ARS', (historial ?? []) as FilaHistorialEstado[]),
      200
    );
  } catch (e) {
    Sentry.captureException(e);
    return respuesta({ error: 'error_interno' }, 500);
  }
}
