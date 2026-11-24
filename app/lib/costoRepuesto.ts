// ============================================================
// Servicio Técnico — ¿se usó repuesto? y costo pendiente (servicio_costo_repuesto_supabase.sql).
//
// Problema que resuelve: una reparación marcada lista sin ningún repuesto cargado se contaba como mano de obra pura (costo cero) y el
// taller aparecía con ~99% de margen. Ahora, al pasar a "Listo para entregar" hay que contestar si se usó repuesto:
//   del_stock    → se eligió un repuesto del stock (su costo queda congelado en reparaciones_repuestos),
//   pendiente    → se usó uno pero todavía no se cargó: la reparación queda con "costo pendiente" y no cuenta como ganancia,
//   sin_repuesto → no se usó: la mano de obra sí cuenta entera como ganancia.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarAuditoria } from './auditoria';
import { soportaMigracion } from './migraciones';

export type DecisionRepuesto = 'del_stock' | 'pendiente' | 'sin_repuesto';

export const ETIQUETA_DECISION_REPUESTO: Record<DecisionRepuesto, string> = {
  del_stock: 'Sí, del stock',
  pendiente: 'Sí, pendiente de cargar',
  sin_repuesto: 'No usó repuesto',
};

type RepuestoUsadoCosto = { cantidad: number | null; costo_unitario: number | null };

// Costo real de los repuestos de una reparación para la línea de su boleta. `costo` null = no se puede saber todavía (pendiente).
//  - Con repuestos cargados: la suma de sus costos; si a alguno le falta el costo, sigue pendiente (no se inventa).
//  - Sin repuestos: solo "No usó repuesto" confirma costo cero; "pendiente" o sin responder queda pendiente.
export function resolverCostoServicio(decision: DecisionRepuesto | null | undefined, usados: RepuestoUsadoCosto[]): { costo: number | null; pendiente: boolean } {
  if (usados.length > 0) {
    if (usados.some((u) => u.costo_unitario == null)) return { costo: null, pendiente: true };
    return { costo: usados.reduce((acc, u) => acc + (u.costo_unitario ?? 0) * (u.cantidad ?? 0), 0), pendiente: false };
  }
  if (decision === 'sin_repuesto') return { costo: 0, pendiente: false };
  return { costo: null, pendiente: true };
}

// ¿La pantalla tiene que marcar esta reparación como "Costo pendiente"? Solo cuando se respondió "pendiente" (las anteriores a esta
// función no tienen respuesta y no se marcan solas).
export const tieneCostoPendiente = (r: { repuesto_decision?: DecisionRepuesto | null }): boolean => r.repuesto_decision === 'pendiente';

// ¿Hay que preguntar? Al pasar a Listo/Entregado, si nadie respondió todavía y no hay ningún repuesto cargado.
export function hayQuePreguntarRepuesto(decision: DecisionRepuesto | null | undefined, repuestosCargados: number): boolean {
  return !decision && repuestosCargados === 0;
}

// Lee el costo de los repuestos de una reparación y lo escribe en la línea de su boleta (si ya existe), con la marca de pendiente.
// Se llama cada vez que cambia algo que afecta ese costo: se usa o se quita un repuesto, o se cambia la respuesta.
export async function sincronizarCostoOrdenServicio(supabase: SupabaseClient, reparacionId: string): Promise<string | null> {
  if (!(await soportaMigracion(supabase, 'costoRepuestoServicio'))) return null;
  const [{ data: rep, error: repError }, { data: usados, error: usadosError }] = await Promise.all([
    supabase.from('reparaciones').select('orden_cobro_id, repuesto_decision').eq('id', reparacionId).maybeSingle(),
    supabase.from('reparaciones_repuestos').select('cantidad, costo_unitario').eq('reparacion_id', reparacionId),
  ]);
  if (repError) return repError.message;
  if (usadosError) return usadosError.message;
  const ordenId = (rep as { orden_cobro_id: string | null } | null)?.orden_cobro_id;
  if (!ordenId) return null; // todavía no hay boleta: el costo se calcula cuando se genere
  const { costo, pendiente } = resolverCostoServicio((rep as { repuesto_decision: DecisionRepuesto | null }).repuesto_decision, (usados as RepuestoUsadoCosto[]) ?? []);
  const { error } = await supabase.from('orden_items').update({ costo, costo_pendiente: pendiente }).eq('orden_id', ordenId).eq('tipo', 'trabajo');
  return error ? error.message : null;
}

// Cada vez que se usa o se quita un repuesto de una reparación: la respuesta se pone al día ("del stock" si quedó alguno; "pendiente" si se
// quitó el único, para que no parezca que no usó) y el costo de la boleta se recalcula.
export async function alCambiarRepuestos(supabase: SupabaseClient, reparacionId: string): Promise<string | null> {
  if (!(await soportaMigracion(supabase, 'costoRepuestoServicio'))) return null;
  const [{ data: rep, error: repError }, { count, error: countError }] = await Promise.all([
    supabase.from('reparaciones').select('repuesto_decision').eq('id', reparacionId).maybeSingle(),
    supabase.from('reparaciones_repuestos').select('id', { count: 'exact', head: true }).eq('reparacion_id', reparacionId),
  ]);
  if (repError) return repError.message;
  if (countError) return countError.message;
  const decision = (rep as { repuesto_decision: DecisionRepuesto | null } | null)?.repuesto_decision ?? null;
  const nueva: DecisionRepuesto | null = (count ?? 0) > 0 ? 'del_stock' : decision === 'del_stock' ? 'pendiente' : decision;
  if (nueva && nueva !== decision) {
    const { error } = await supabase.from('reparaciones').update({ repuesto_decision: nueva, repuesto_decision_at: new Date().toISOString() }).eq('id', reparacionId);
    if (error) return error.message;
  }
  return sincronizarCostoOrdenServicio(supabase, reparacionId);
}

// Guarda la respuesta ("Sí, del stock" / "pendiente" / "No usó") y actualiza el costo de la boleta. Devuelve el error, si lo hubo.
export async function registrarDecisionRepuesto(
  supabase: SupabaseClient,
  reparacion: { id: string; numero_orden?: string | null },
  decision: DecisionRepuesto,
  actorNombre: string | null
): Promise<string | null> {
  const { error } = await supabase
    .from('reparaciones')
    .update({ repuesto_decision: decision, repuesto_decision_at: new Date().toISOString(), repuesto_decision_por: actorNombre })
    .eq('id', reparacion.id);
  if (error) return error.message;
  await registrarAuditoria(supabase, {
    accion: `respondió "${ETIQUETA_DECISION_REPUESTO[decision]}" a si se usó repuesto en la reparación ${reparacion.numero_orden || ''}`.trim(),
    entidad: 'reparacion',
    entidadId: reparacion.id,
    valorNuevo: { repuesto_decision: decision },
  });
  return sincronizarCostoOrdenServicio(supabase, reparacion.id);
}
