// Equipos con una seña (Plan de ahorro con dispositivo_id puntual) todavía
// ACTIVA — helper compartido para no repetir este mismo query con criterios
// que terminan divisando entre pantallas (pasó de verdad: dos copias
// nuevas de este query usaban `estado = 'activo'` mientras la original en
// Plan de ahorro usaba "no completado ni cancelado" — equivalentes solo
// mientras existan exactamente esos 3 estados; un estado nuevo el día de
// mañana las desincroniza en silencio). "No completado ni cancelado" (en
// vez de "= activo") es a propósito la versión más cautelosa: cualquier
// estado que no sea explícitamente uno de esos dos términos sigue
// contando como reservado, así que un estado nuevo que se agregue después
// no hace que un equipo señado vuelva a parecer disponible por error.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function obtenerDispositivosSenados(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from('planes_ahorro')
    .select('dispositivo_id')
    .not('dispositivo_id', 'is', null)
    .not('estado', 'in', '(completado,cancelado)');
  return new Set(((data ?? []) as { dispositivo_id: string }[]).map((p) => p.dispositivo_id));
}
