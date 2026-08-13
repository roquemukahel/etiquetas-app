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
// datos, así el resto de las páginas se piden todas en paralelo en vez de
// una function detrás de la otra — con 10 páginas (10.000 filas) esto pasa
// de ~10 round-trips en fila a 1 + 9 en simultáneo, que es la diferencia
// real entre "tarda varios segundos" y "tarda uno".
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

  const primera = await construirQuery(0, TAMANO_PAGINA - 1, true);
  if (primera.error || !primera.data) return [];

  let todas: T[] = primera.data as T[];
  const total = primera.count ?? todas.length;

  if (total > TAMANO_PAGINA) {
    const pendientes: Promise<{ data: T[] | null; error: unknown }>[] = [];
    for (let desde = TAMANO_PAGINA; desde < total; desde += TAMANO_PAGINA) {
      pendientes.push(construirQuery(desde, desde + TAMANO_PAGINA - 1, false));
    }
    const resultados = await Promise.all(pendientes);
    for (const r of resultados) {
      if (!r.error && r.data) todas = todas.concat(r.data);
    }
  }

  return todas;
}
