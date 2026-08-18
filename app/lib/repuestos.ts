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
