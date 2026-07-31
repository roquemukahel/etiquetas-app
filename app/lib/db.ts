import { SupabaseClient } from '@supabase/supabase-js';

// Supabase/PostgREST limita cada respuesta a un máximo de filas (1000 por
// defecto), sin avisar que hay más — simplemente corta ahí. Para tablas que
// pueden crecer más que eso (clientes, dispositivos, sobre todo después de
// importar un historial grande), esta función junta todas las páginas hasta
// traer la tabla completa. Se ordena siempre por "id" además del criterio
// pedido, para que el recorte entre páginas sea estable y no se salteen ni
// repitan filas.
export async function obtenerTodasLasFilas<T>(
  supabase: SupabaseClient,
  tabla: string,
  select: string,
  ordenar: { columna: string; ascending?: boolean }[] = []
): Promise<T[]> {
  const TAMANO_PAGINA = 1000;
  let desde = 0;
  let todas: T[] = [];

  while (true) {
    let query: any = supabase.from(tabla).select(select).range(desde, desde + TAMANO_PAGINA - 1);
    for (const o of ordenar) query = query.order(o.columna, { ascending: o.ascending ?? true });
    query = query.order('id', { ascending: true });

    const { data, error } = await query;
    if (error || !data) break;
    todas = todas.concat(data as T[]);
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return todas;
}
