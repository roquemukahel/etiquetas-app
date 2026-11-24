// Hasta cuánto se puede corregir el monto de un pago ya registrado, sin que quede más plata aplicada de la que la deuda admite.
export type AplicacionAnterior = { cuota_id: string; monto_aplicado: number };
export type CuotaParaCorregir = { id: string; importe_original: number; importe_pagado: number };

// - Pago aplicado a UNA cuota: lo que esa cuota todavía debe + lo que este pago ya le había aplicado.
// - Pago de cuenta corriente "pura" (sin cuotas): el monto actual + lo que la cuenta corriente todavía admite (saldo menos
//   lo que corresponde a cuotas pendientes), igual que el tope al registrar un pago nuevo.
// - Pago repartido entre varias cuotas (cobros viejos): null = sin tope fijo (se vuelve a repartir solo).
export function topeParaCorregirPago(p: {
  montoActual: number;
  aplicaciones: AplicacionAnterior[];
  cuotas: CuotaParaCorregir[];
  saldoCuenta: number;
  saldoCuotasPendientes: number;
}): number | null {
  if (p.aplicaciones.length === 0) {
    return p.montoActual + Math.max(0, p.saldoCuenta - p.saldoCuotasPendientes);
  }
  if (p.aplicaciones.length === 1) {
    const ap = p.aplicaciones[0];
    const cuota = p.cuotas.find((c) => c.id === ap.cuota_id);
    if (!cuota) return null;
    return Math.max(0, cuota.importe_original - cuota.importe_pagado) + ap.monto_aplicado;
  }
  return null;
}
