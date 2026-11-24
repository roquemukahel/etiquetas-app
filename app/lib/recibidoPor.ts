import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';
import { soportaMigracion } from './migraciones';
import { registrarFallo } from './escritura';

// Quién recibió el equipo en Servicio Técnico: la persona que se identificó con PIN al recibirlo (no el
// vendedor que después lo cobra). Se guarda en la reparación (recibido_por_nombre / recibido_por_foto_url,
// ver servicio_tecnico_recibido_por_supabase.sql) y queda anotado en el historial de la ficha.
// Mientras el negocio no corrió ese SQL no se agrega ninguna columna (el insert seguiría funcionando).
export async function camposRecibidoPor(
  supabase: SupabaseClient
): Promise<{ recibido_por_nombre?: string | null; recibido_por_foto_url?: string | null }> {
  const actor = getActor();
  if (!actor) return {};
  if (!(await soportaMigracion(supabase, 'recibidoPor'))) return {};
  return { recibido_por_nombre: actor.nombre ?? null, recibido_por_foto_url: actor.fotoUrl ?? null };
}

// Renglón "Equipo recibido por X" en el historial de cada ficha. Si no se puede guardar, no frena la
// recepción: el equipo ya se recibió bien.
export async function registrarRecepcionEnHistorial(supabase: SupabaseClient, reparacionIds: string[]): Promise<void> {
  const actor = getActor();
  if (!actor || reparacionIds.length === 0) return;
  const { error } = await supabase.from('reparaciones_eventos').insert(
    reparacionIds.map((id) => ({
      reparacion_id: id,
      tipo: 'sistema',
      texto: `Equipo recibido por ${actor.nombre}`,
      actor_nombre: actor.nombre ?? null,
      actor_tipo: actor.tipo ?? null,
    }))
  );
  if (error) registrarFallo(error, 'registrar la recepción del equipo en el historial');
}
