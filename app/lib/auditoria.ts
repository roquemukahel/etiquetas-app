import { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';

// Registra una acción sensible en el libro de auditoría. Si todavía no se
// eligió quién está trabajando, no rompe el flujo: simplemente no queda
// registrada (mejor eso que bloquear al usuario en medio de una tarea).
export async function registrarAuditoria(
  supabase: SupabaseClient,
  datos: {
    accion: string;
    entidad: string;
    entidadId?: string;
    valorAnterior?: unknown;
    valorNuevo?: unknown;
  }
) {
  const actor = getActor();
  if (!actor) return;

  try {
    await supabase.from('auditoria').insert({
      actor_nombre: actor.nombre,
      actor_tipo: actor.tipo,
      accion: datos.accion,
      entidad: datos.entidad,
      entidad_id: datos.entidadId ?? null,
      valor_anterior: datos.valorAnterior ?? null,
      valor_nuevo: datos.valorNuevo ?? null,
    });
  } catch {
    // La auditoría nunca debe romper la acción principal del usuario.
  }
}
