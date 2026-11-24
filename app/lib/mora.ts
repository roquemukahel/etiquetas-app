// Mora de un cliente según la base (saldos_cuenta_corriente(), ver mora_fifo_supabase.sql): los pagos se imputan a la deuda más
// vieja primero, así que "vencido" es lo que realmente falta pagar de lo que ya venció. Un solo cálculo para la tarjeta de
// Cuentas por cobrar, la ficha del cliente y el estado (al día / en mora).

export type FilaMoraSql = {
  cliente_id?: string;
  saldo: number | string | null;
  vencido: number | string | null;
  // Estos tres vienen solo cuando el negocio ya corrió mora_fifo_supabase.sql.
  vencimiento_impago?: string | null;
  proximo_vencimiento?: string | null;
  proximo_monto?: number | string | null;
  vencido_cuotas?: number | string | null;
  vencido_fiado?: number | string | null;
};

export type MoraCliente = {
  saldo: number;
  vencido: number;
  // Fecha del cargo vencido más viejo que todavía tiene saldo impago (de ahí se cuentan los días de atraso).
  vencimientoImpago: string | null;
  // El próximo vencimiento que de verdad falta pagar (puede ser futuro) y cuánto falta de ese cargo.
  proximoVencimiento: string | null;
  proximoMonto: number | null;
  // El vencido separado según de dónde viene: cuotas de financiación o cuenta corriente / fiado (suman el vencido total).
  vencidoCuotas: number;
  vencidoFiado: number;
};

const aNumero = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// null = la base todavía tiene la versión vieja del cálculo (sin imputación FIFO): quien llama usa su cálculo de siempre.
export function leerMoraSql(fila: FilaMoraSql | null | undefined): MoraCliente | null {
  if (!fila || fila.proximo_vencimiento === undefined) return null;
  const monto = fila.proximo_monto == null ? null : aNumero(fila.proximo_monto);
  return {
    saldo: aNumero(fila.saldo),
    vencido: aNumero(fila.vencido),
    vencimientoImpago: fila.vencimiento_impago ?? null,
    proximoVencimiento: fila.proximo_vencimiento ?? null,
    proximoMonto: monto,
    vencidoCuotas: aNumero(fila.vencido_cuotas),
    vencidoFiado: aNumero(fila.vencido_fiado),
  };
}
