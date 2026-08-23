import { SupabaseClient } from '@supabase/supabase-js';
import { registrarAuditoria } from './auditoria';
import { infoEstado, CHECKLIST_CALIDAD_GENERICO } from './reparaciones';
import { liberarRepuestosDeReparaciones } from './repuestos';

// Cambiar el estado de una reparación se podía disparar desde 3 lugares
// (lista de Reparaciones, Mi banco, la ficha) y cada uno tenía su propia
// copia de la lógica — con el tiempo se desincronizaron: la ficha ganó el
// bloqueo de control de calidad (Fase 6) y la limpieza de la orden vacía al
// cancelar, pero la lista y Mi banco se quedaron con la versión vieja, así
// que alguien podía saltearse el control de calidad marcando "Listo para
// entregar" desde ahí en vez de la ficha. Ahora hay una sola función que
// usan los tres lugares.
type ReparacionMinima = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  estado: string;
  fecha_reparado: string | null;
  orden_cobro_id: string | null;
  trabajos_realizados: string[] | null;
};

async function controlesDeCalidadFaltantes(supabase: SupabaseClient, r: ReparacionMinima): Promise<string[]> {
  const [{ data: trabajos }, { data: controlados }] = await Promise.all([
    r.trabajos_realizados && r.trabajos_realizados.length > 0
      ? supabase.from('trabajos').select('nombre, checklist_tecnico').in('nombre', r.trabajos_realizados)
      : Promise.resolve({ data: [] as { nombre: string; checklist_tecnico: string[] | null }[] }),
    supabase.from('reparaciones_control_calidad').select('item').eq('reparacion_id', r.id),
  ]);
  const deServicios = new Set<string>();
  for (const t of trabajos ?? []) for (const item of t.checklist_tecnico ?? []) deServicios.add(item);
  const checklist = deServicios.size > 0 ? Array.from(deServicios) : CHECKLIST_CALIDAD_GENERICO;
  const hechos = new Set((controlados ?? []).map((c: { item: string }) => c.item));
  return checklist.filter((item) => !hechos.has(item));
}

// Devuelve null si el cambio se aplicó, o el motivo si el usuario canceló
// (para que el que llama sepa que no debe seguir con sus propios efectos,
// como el cartel de WhatsApp).
export async function cambiarEstadoReparacion(
  supabase: SupabaseClient,
  r: ReparacionMinima,
  nuevoEstado: string,
  actorNombre: string | null = null
): Promise<'aplicado' | 'cancelado'> {
  let overrideControlCalidad = false;
  let controlesFaltantes: string[] = [];
  if (nuevoEstado === 'listo_para_entregar') {
    const faltantes = await controlesDeCalidadFaltantes(supabase, r);
    if (faltantes.length > 0) {
      const plural = faltantes.length === 1 ? '' : 's';
      if (
        !confirm(
          `Faltan ${faltantes.length} control${plural} de calidad obligatorio${plural} (${faltantes.join(', ')}). ¿Marcar como listo igual? Va a quedar registrado como excepción.`
        )
      ) {
        return 'cancelado';
      }
      overrideControlCalidad = true;
      controlesFaltantes = faltantes;
    }
  }

  const cambios: Record<string, unknown> = { estado: nuevoEstado, estado_actualizado_at: new Date().toISOString() };
  if (overrideControlCalidad) cambios.control_calidad_override = true;
  // "Listo para entregar" y "Entregado" cuentan igual como trabajo terminado
  // del técnico en Estadísticas (ambos se rankean por fecha_reparado).
  if ((nuevoEstado === 'listo_para_entregar' || nuevoEstado === 'entregado') && !r.fecha_reparado) {
    cambios.fecha_reparado = new Date().toISOString();
  }
  await supabase.from('reparaciones').update(cambios).eq('id', r.id);

  // Cancelar (a diferencia de eliminar) no borraba la reparación, así que
  // nadie liberaba los repuestos que tuviera reservados/consumidos — quedaban
  // descontados del stock para siempre por un trabajo que nunca se hizo.
  // Mismo criterio y misma función que ya usa eliminarDefinitivo. Best-effort:
  // si falla, no bloquea la cancelación, pero el error queda en la auditoría.
  let liberacionError: string | null = null;
  if (nuevoEstado === 'cancelado') {
    const liberacion = await liberarRepuestosDeReparaciones(supabase, [r.id], actorNombre);
    if (!liberacion.ok) liberacionError = liberacion.error;
  }

  // La orden vinculada se borra al cancelar SOLO si sigue en $0 y pendiente
  // — si ya tiene un total cargado o está pagada/entregada, es plata real y
  // no se toca aunque después la marquen como cancelada.
  if (nuevoEstado === 'cancelado' && r.orden_cobro_id) {
    const { data: ordenVinculada } = await supabase.from('ordenes').select('estado, total').eq('id', r.orden_cobro_id).maybeSingle();
    if (ordenVinculada && ordenVinculada.estado === 'pendiente' && !ordenVinculada.total) {
      await supabase.from('ordenes').delete().eq('id', r.orden_cobro_id);
      await registrarAuditoria(supabase, {
        accion: `eliminó la orden de cobro vacía de una reparación cancelada (${r.numero_orden || ''})`,
        entidad: 'orden',
        entidadId: r.orden_cobro_id,
        valorAnterior: { estado: ordenVinculada.estado, total: ordenVinculada.total },
      });
    }
  }

  const avisoLiberacion = liberacionError ? ` (no se pudieron liberar los repuestos: ${liberacionError})` : '';
  await registrarAuditoria(supabase, {
    accion: `cambió el estado de la reparación ${r.numero_orden || ''} (${r.modelo || 'sin modelo'}) de "${infoEstado(r.estado).label}" a "${infoEstado(nuevoEstado).label}"${
      overrideControlCalidad ? ` (con controles de calidad pendientes: ${controlesFaltantes.join(', ')})` : ''
    }${avisoLiberacion}`,
    entidad: 'reparacion',
    entidadId: r.id,
    valorAnterior: { estado: r.estado },
    valorNuevo: { estado: nuevoEstado },
  });

  return 'aplicado';
}
