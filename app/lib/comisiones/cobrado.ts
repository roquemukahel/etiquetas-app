import { redondear } from './motor';

// Comisión de ventas financiadas "sobre lo cobrado": en vez de pagar toda la comisión el día de la venta, se genera de a poco, a medida
// que se cobran las cuotas. Funciones puras (sin Supabase); el servidor (generar.ts) arma los datos y guarda lo que acá se decide.

export type CuotaCobro = { importe_original: number; importe_pagado: number };

// Qué parte del valor de la venta ya se cobró: lo que no se financió entra al vender (entrega inicial, anticipo, equipo, otros pagos) y
// la parte financiada entra a medida que se pagan las cuotas del plan. Va de 0 a 1. Sin plan o sin cuotas, la venta se toma como cobrada.
export function fraccionCobrada(p: { valorVenta: number; financiado: number; cuotas: CuotaCobro[] }): number {
  if (!(p.valorVenta > 0) || !(p.financiado > 0)) return 1;
  const financiado = Math.min(p.financiado, p.valorVenta);
  const totalCuotas = p.cuotas.reduce((a, c) => a + Math.max(0, c.importe_original || 0), 0);
  if (totalCuotas <= 0) return 1;
  const pagado = p.cuotas.reduce((a, c) => a + Math.min(Math.max(0, c.importe_pagado || 0), Math.max(0, c.importe_original || 0)), 0);
  const fraccionCuotas = Math.min(1, pagado / totalCuotas);
  const cobrado = p.valorVenta - financiado + financiado * fraccionCuotas;
  return Math.min(1, Math.max(0, cobrado / p.valorVenta));
}

export type LineaAComisionar = { lineaId: string; comisionTotal: number; baseTotal: number };
export type MovimientoExistente = { orden_item_id: string | null; comision: number };
export type MovimientoPlaneado = {
  lineaId: string;
  tipo: 'comision' | 'reversion';
  comision: number; // negativo si es reversión
  base: number;
  // null en reversiones (nunca son idempotentes, igual que las del resto del módulo)
  idempotencyKey: string | null;
};

// Compara, línea por línea, lo que ya se generó con lo que corresponde a lo cobrado hasta hoy (comisión total de la línea × fracción
// cobrada) y devuelve lo que falta generar: un movimiento de comisión por la diferencia si se cobró más, o una reversión si se cobró
// menos (un pago que se anuló o se corrigió a un monto menor). Lo ya generado nunca se toca.
export function planearPorCobrado(p: {
  lineas: LineaAComisionar[];
  fraccion: number;
  existentes: MovimientoExistente[];
  claveBase: (lineaId: string) => string;
  decimales: number;
}): MovimientoPlaneado[] {
  const salida: MovimientoPlaneado[] = [];
  for (const l of p.lineas) {
    if (!(l.comisionTotal > 0)) continue;
    const deLaLinea = p.existentes.filter((e) => e.orden_item_id === l.lineaId);
    const neto = deLaLinea.reduce((a, e) => a + e.comision, 0);
    const objetivo = redondear(l.comisionTotal * Math.min(1, Math.max(0, p.fraccion)), p.decimales);
    const delta = redondear(objetivo - neto, p.decimales);
    if (delta === 0) continue;
    const base = redondear((l.baseTotal * Math.abs(delta)) / l.comisionTotal, p.decimales);
    if (delta > 0) {
      const n = deLaLinea.length;
      salida.push({ lineaId: l.lineaId, tipo: 'comision', comision: delta, base, idempotencyKey: n === 0 ? p.claveBase(l.lineaId) : `${p.claveBase(l.lineaId)}:${n}` });
    } else {
      salida.push({ lineaId: l.lineaId, tipo: 'reversion', comision: delta, base, idempotencyKey: null });
    }
  }
  return salida;
}
