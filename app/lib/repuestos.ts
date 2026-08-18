import { SupabaseClient } from '@supabase/supabase-js';

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
    return { ok: false, error: (errorConsumos ?? errorReservas)?.message ?? 'No pudimos leer los repuestos vinculados' };
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
