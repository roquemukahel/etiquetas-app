import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { obtenerTodasLasFilas } from '../../../lib/db';
import {
  armarStockPublicoJson,
  CABECERAS_CORS,
  COLUMNAS_STOCK_PUBLICO_JSON,
  faltaMigracionJson,
  FORMATO_TOKEN,
  type FilaStockPublico,
} from '../../../lib/stockPublicoJson';

// Stock en JSON para que otra app lo lea en vivo: GET /stock-publico/<token_stock_json>/json
//
// NO es el enlace que se les manda a los clientes: tiene su propio token e interruptor (Configuración → Stock público →
// "Enlace para otra app"), porque además de modelo, capacidad, color y cantidad trae batería y precio. Solo responde si ese
// enlace está encendido, y solo muestra los equipos en stock que no se ocultaron del público.
// Mientras el negocio no corra stock_publico_json_supabase.sql se sigue aceptando el enlace público de siempre.
// Se lee con la clave de servicio, así que todo está acotado acá: se busca el negocio por su token, se filtra por
// ese negocio y se piden únicamente las columnas públicas (sin costo, IMEI, serie, proveedor ni clientes).
export const dynamic = 'force-dynamic';

// Sin caché en ningún lado (CDN ni navegador): la app que lo lee siempre ve el stock de ese momento, y un enlace apagado o
// regenerado deja de responder al instante en vez de seguir sirviéndose unos segundos.
const respuesta = (cuerpo: unknown, status: number) =>
  NextResponse.json(cuerpo, { status, headers: { ...CABECERAS_CORS, 'Cache-Control': 'no-store', Vary: 'Accept' } });

// La app que lee desde un navegador de otro dominio pregunta antes con OPTIONS (preflight).
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CABECERAS_CORS });
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!FORMATO_TOKEN.test(token)) return respuesta({ error: 'Stock no encontrado' }, 404);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    Sentry.captureMessage('Stock público JSON: falta configuración de Supabase en el servidor', 'error');
    return respuesta({ error: 'Servicio no disponible' }, 500);
  }

  try {
    const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
    let { data: negocio, error } = await supabase
      .from('negocios')
      .select('id, nombre, moneda')
      .eq('token_stock_json', token)
      .eq('stock_json_activo', true)
      .maybeSingle();
    if (faltaMigracionJson(error)) {
      ({ data: negocio, error } = await supabase
        .from('negocios')
        .select('id, nombre, moneda')
        .eq('token_stock_publico', token)
        .eq('stock_publico_activo', true)
        .maybeSingle());
    }
    if (error) throw error;
    if (!negocio) return respuesta({ error: 'Stock no encontrado' }, 404);

    const filas = await obtenerTodasLasFilas<FilaStockPublico>(
      supabase,
      'dispositivos',
      COLUMNAS_STOCK_PUBLICO_JSON,
      [{ columna: 'created_at', ascending: true }],
      (q) => q.eq('negocio_id', negocio.id).eq('en_stock', true).eq('mostrar_en_stock_publico', true)
    );

    return respuesta(armarStockPublicoJson({ nombre: negocio.nombre, moneda: negocio.moneda }, filas), 200);
  } catch (e) {
    Sentry.captureException(e);
    return respuesta({ error: 'No pudimos leer el stock' }, 500);
  }
}
