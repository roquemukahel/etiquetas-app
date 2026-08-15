import { SupabaseClient } from '@supabase/supabase-js';

// Borra muchas filas por id, en tandas (para no armar un WHERE IN con miles
// de ids de una sola vez). Un DELETE ... WHERE IN (...) es una sola
// sentencia: si UNA fila de la tanda está bloqueada por una clave foránea
// (ej. un cliente con ventas, un dispositivo ya vendido), Postgres deshace
// TODA la tanda. Por eso, si una tanda falla, se reintenta de a una fila
// para saber exactamente cuáles sí se pudieron borrar y cuáles no.
export async function eliminarEnBloque(
  supabase: SupabaseClient,
  tabla: string,
  ids: string[],
  tamanoTanda = 500
): Promise<{ eliminados: string[]; bloqueados: string[] }> {
  const eliminados: string[] = [];
  const bloqueados: string[] = [];
  for (let i = 0; i < ids.length; i += tamanoTanda) {
    const tanda = ids.slice(i, i + tamanoTanda);
    const { error } = await supabase.from(tabla).delete().in('id', tanda);
    if (!error) {
      eliminados.push(...tanda);
      continue;
    }
    for (const id of tanda) {
      const { error: errorFila } = await supabase.from(tabla).delete().eq('id', id);
      if (errorFila) bloqueados.push(id);
      else eliminados.push(id);
    }
  }
  return { eliminados, bloqueados };
}
