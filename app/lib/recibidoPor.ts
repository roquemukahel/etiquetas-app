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

// Quién recibió la COMPRA o el CANJE en el momento de cargarlo — separado de
// quién después lo agrega al Stock (dispositivos.agregado_por_nombre: puede
// ser otra persona, en otro momento). Columna propia de compras/canjes (ver
// recibido_por_canje_compras_supabase.sql), independiente de la de arriba
// (reparaciones) para no exigirle a un negocio correr una migración que no
// necesita. El actor se recibe YA CAPTURADO (no se llama getActor() aquí
// adentro): si el que llama lo capturó una sola vez al principio de guardar
// -antes de cualquier confirm()/await- en vez de volver a leerlo después,
// evita el bug real donde un cambio de cuenta a mitad de guardar terminaba
// atribuyendo la operación a la cuenta nueva en vez de a quien la inició.
export async function camposRecibidoPorOperacion(
  supabase: SupabaseClient,
  actor: { nombre?: string | null; fotoUrl?: string | null } | null
): Promise<{ recibido_por_nombre?: string | null; recibido_por_foto_url?: string | null }> {
  if (!actor) return {};
  if (!(await soportaMigracion(supabase, 'recibidoPorCanjeCompras'))) return {};
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
