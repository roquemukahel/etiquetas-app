import { SupabaseClient } from '@supabase/supabase-js';

// Supabase/PostgREST limita cada respuesta a un máximo de filas (1000 por
// defecto), sin avisar que hay más — simplemente corta ahí. Para tablas que
// pueden crecer más que eso (clientes, dispositivos, sobre todo después de
// importar un historial grande), esta función junta todas las páginas hasta
// traer la tabla completa. Se ordena siempre por "id" además del criterio
// pedido, para que el recorte entre páginas sea estable y no se salteen ni
// repitan filas.
//
// La primera página pide el conteo total (count: 'exact') junto con los
// datos, así el resto de las páginas se piden en paralelo (en tandas, ver
// CONCURRENCIA_MAXIMA) en vez de una detrás de la otra — con 10 páginas
// (10.000 filas) esto pasa de ~10 round-trips en fila a un puñado en
// simultáneo, que es la diferencia real entre "tarda varios segundos" y
// "tarda uno".
//
// BUG REAL encontrado 2026-09-04 (reportado por un cliente con catálogos de
// varios miles de productos, ej. 2000+ solo en una categoría): si UNA
// página fallaba (timeout, límite de conexiones simultáneas de Supabase,
// lo que sea) con muchas páginas pedidas todas juntas de una, esa página se
// descartaba en silencio — la función devolvía igual, solo que con menos
// filas de las que existen de verdad, sin ningún aviso. Con catálogos
// grandes (10+ páginas pedidas de una) esto pasaba seguido y explica
// carpetas/categorías que "no cargan todo" de forma inconsistente entre
// pantallas y recargas. Se corrige con reintentos por página + un límite de
// páginas en vuelo al mismo tiempo (en vez de todas de una), para no
// saturar la cantidad de conexiones simultáneas que dispara el problema.
const CONCURRENCIA_MAXIMA = 6;
const REINTENTOS_POR_PAGINA = 2;

// "conConteo" se pasa explícito porque la primera página TAMBIÉN necesita
// reintentos (BUG REAL encontrado en la revisión de esta misma sesión: solo
// las páginas 2+ reintentaban, así que cualquier tabla de 1000 filas o
// menos —la mayoría— seguía teniendo el problema original entero: un solo
// fallo transitorio en esa única página hacía que toda la función
// devolviera vacío, sin reintento y sin dejar rastro en la consola).
async function pedirPaginaConReintento(
  construirQuery: (desde: number, hasta: number, conConteo: boolean) => any,
  desde: number,
  hasta: number,
  conConteo = false
): Promise<{ data: any[]; count: number | null }> {
  let ultimoError: unknown = null;
  for (let intento = 0; intento <= REINTENTOS_POR_PAGINA; intento++) {
    const { data, error, count } = await construirQuery(desde, hasta, conConteo);
    if (!error && data) return { data, count: count ?? null };
    ultimoError = error;
    // Backoff chico entre reintentos — no tiene sentido reintentar
    // instantáneo si la causa fue saturar la cantidad de conexiones.
    if (intento < REINTENTOS_POR_PAGINA) await new Promise((r) => setTimeout(r, 300 * (intento + 1)));
  }
  // Se agotaron los reintentos: se registra el error (antes se descartaba
  // en silencio, sin dejar ningún rastro) pero se sigue devolviendo un
  // array vacío para esta página en vez de cortar todo con una excepción —
  // esta función se usa desde docenas de pantallas que no esperan que
  // pueda fallar, y preferimos "faltan algunas filas" (raro, ya con los
  // reintentos de arriba) a que una pantalla entera se quede colgada.
  console.error(`obtenerTodasLasFilas: no se pudo traer una página después de ${REINTENTOS_POR_PAGINA + 1} intentos.`, ultimoError);
  return { data: [], count: null };
}

export async function obtenerTodasLasFilas<T>(
  supabase: SupabaseClient,
  tabla: string,
  select: string,
  ordenar: { columna: string; ascending?: boolean }[] = [],
  // Para condiciones tipo .eq()/.not(), ej: (q) => q.eq('en_stock', true).
  filtro?: (query: any) => any
): Promise<T[]> {
  const TAMANO_PAGINA = 1000;

  const construirQuery = (desde: number, hasta: number, conConteo: boolean) => {
    let query: any = supabase
      .from(tabla)
      .select(select, conConteo ? { count: 'exact' } : undefined)
      .range(desde, hasta);
    if (filtro) query = filtro(query);
    for (const o of ordenar) query = query.order(o.columna, { ascending: o.ascending ?? true });
    return query.order('id', { ascending: true });
  };

  const primera = await pedirPaginaConReintento(construirQuery, 0, TAMANO_PAGINA - 1, true);

  let todas: T[] = primera.data as T[];
  const total = primera.count ?? todas.length;

  if (total > TAMANO_PAGINA) {
    const rangos: [number, number][] = [];
    for (let desde = TAMANO_PAGINA; desde < total; desde += TAMANO_PAGINA) {
      rangos.push([desde, desde + TAMANO_PAGINA - 1]);
    }
    // En tandas de CONCURRENCIA_MAXIMA en vez de todas las páginas juntas —
    // con catálogos de decenas de miles de filas, pedir 20+ páginas al
    // mismo tiempo es justo lo que dispara el fallo silencioso de arriba.
    for (let i = 0; i < rangos.length; i += CONCURRENCIA_MAXIMA) {
      const tanda = rangos.slice(i, i + CONCURRENCIA_MAXIMA);
      const resultados = await Promise.all(tanda.map(([desde, hasta]) => pedirPaginaConReintento(construirQuery, desde, hasta)));
      for (const r of resultados) todas = todas.concat(r.data as T[]);
    }
  }

  return todas;
}
