import { SupabaseClient } from '@supabase/supabase-js';
import { tr } from './tr';
import { registrarAuditoria } from './auditoria';

// Las funciones RPC de stock (repuesto_consumir, repuesto_registrar_movimiento,
// repuesto_reservar — ver repuestos_reservas_movimientos_supabase.sql) tiran
// un mensaje "STOCK_INSUFICIENTE:<stock actual>" o
// "DISPONIBLE_INSUFICIENTE:<disponible actual>" cuando la operación pedida
// no entra en el stock/reservado actual. Estas funciones lo interpretan para
// poder ofrecerle al usuario confirmar y forzar en vez de mostrar el error
// crudo de Postgres — mismo criterio en cualquier pantalla que llame a esas
// RPC, para no reimplementar el parseo en cada una.
export function extraerStockInsuficiente(mensaje: string | undefined | null): number | null {
  if (!mensaje) return null;
  const m = mensaje.match(/STOCK_INSUFICIENTE:(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function extraerDisponibleInsuficiente(mensaje: string | undefined | null): number | null {
  if (!mensaje) return null;
  const m = mensaje.match(/DISPONIBLE_INSUFICIENTE:(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// Usa un repuesto del stock en una reparación (función repuesto_consumir: bloquea la fila del repuesto mientras dura, así que dos consumos
// simultáneos del mismo repuesto no se pisan). Si no alcanza el stock, pregunta con `confirmarNegativo` si usarlo igual. Devuelve ok:false con
// error null cuando la persona decidió no usarlo (no hay nada que mostrar), o el mensaje si falló de verdad.
export async function consumirRepuesto(
  supabase: SupabaseClient,
  p: {
    repuestoId: string;
    nombre: string;
    reparacionId: string;
    numeroOrden: string | null;
    cantidad: number;
    actorNombre: string | null;
    confirmarNegativo: (stockActual: number) => boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const intentar = (forzar: boolean) =>
    supabase.rpc('repuesto_consumir', {
      p_repuesto_id: p.repuestoId,
      p_reparacion_id: p.reparacionId,
      p_cantidad: p.cantidad,
      p_actor_nombre: p.actorNombre,
      p_forzar: forzar,
    });

  let { error } = await intentar(false);
  if (error) {
    const stockActual = extraerStockInsuficiente(error.message);
    if (stockActual == null || !p.confirmarNegativo(stockActual)) return { ok: false, error: stockActual == null ? error.message : null };
    ({ error } = await intentar(true));
    if (error) return { ok: false, error: error.message };
  }
  await registrarAuditoria(supabase, {
    accion: `usó ${p.cantidad} de "${p.nombre}" en la reparación ${p.numeroOrden || ''}`,
    entidad: 'reparacion',
    entidadId: p.reparacionId,
  });
  return { ok: true };
}

// Antes de borrar definitivamente una o varias reparaciones (acá, o al
// cancelar una orden que había derivado equipos a Servicio Técnico), hay
// que devolver al stock lo que tengan consumido/reservado — si no, esas
// filas se van en cascada con la reparación y el stock queda mal para
// siempre (ya no existiría el registro que las RPC de liberación
// necesitan para deshacer el movimiento). Devuelve ok:false ante CUALQUIER
// error para que quien llama pueda abortar el borrado en vez de seguir
// adelante con una liberación parcial.
export async function liberarRepuestosDeReparaciones(
  supabase: SupabaseClient,
  reparacionIds: string[],
  actorNombre: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (reparacionIds.length === 0) return { ok: true };

  const [{ data: consumos, error: errorConsumos }, { data: reservas, error: errorReservas }] = await Promise.all([
    supabase.from('reparaciones_repuestos').select('id').in('reparacion_id', reparacionIds),
    supabase.from('repuestos_reservas').select('id').in('reparacion_id', reparacionIds).eq('estado', 'activa'),
  ]);
  if (errorConsumos || errorReservas) {
    return { ok: false, error: (errorConsumos ?? errorReservas)?.message ?? tr('No pudimos leer los repuestos vinculados') };
  }

  for (const c of consumos ?? []) {
    const { error } = await supabase.rpc('repuesto_quitar_consumo', { p_reparacion_repuesto_id: c.id, p_actor_nombre: actorNombre });
    if (error) return { ok: false, error: error.message };
  }
  for (const res of reservas ?? []) {
    const { error } = await supabase.rpc('repuesto_liberar_reserva', { p_reserva_id: res.id, p_actor_nombre: actorNombre });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
