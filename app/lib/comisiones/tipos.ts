// Tipos de fila (BD) y etiquetas legibles del módulo de comisiones. En español,
// pensado para la UI (no exponer nombres técnicos al usuario).
import type { TipoCalculo, AlcanceRegla, TipoVenta } from './motor';

export type EstadoMovimiento = 'generada' | 'aprobada' | 'en_liquidacion' | 'pagada' | 'revertida';
export type TipoMovimiento = 'comision' | 'reversion' | 'ajuste_positivo' | 'ajuste_negativo';
export type EstadoLiquidacion = 'borrador' | 'confirmada' | 'parcial' | 'pagada' | 'anulada';

export const LABEL_TIPO_CALCULO: Record<TipoCalculo, string> = {
  porcentaje_venta: '% sobre la venta',
  porcentaje_ganancia: '% sobre la ganancia',
  fijo_por_unidad: 'Monto fijo por unidad',
  fijo_por_venta: 'Monto fijo por venta',
};

export const LABEL_ALCANCE: Record<AlcanceRegla, string> = {
  todas: 'Todas las ventas',
  minorista: 'Ventas minoristas',
  mayorista: 'Ventas mayoristas',
  contado: 'Ventas de contado',
  financiado: 'Ventas financiadas (en cuotas)',
  tipo_item: 'Un tipo de ítem',
  producto: 'Un producto',
};

export const LABEL_TIPO_VENTA: Record<TipoVenta, string> = {
  minorista: 'Minorista',
  mayorista: 'Mayorista',
};

export const LABEL_ESTADO_MOV: Record<EstadoMovimiento, string> = {
  generada: 'Generada',
  aprobada: 'Aprobada',
  en_liquidacion: 'En liquidación',
  pagada: 'Pagada',
  revertida: 'Revertida',
};

export const LABEL_TIPO_MOV: Record<TipoMovimiento, string> = {
  comision: 'Comisión',
  reversion: 'Reversión',
  ajuste_positivo: 'Ajuste (+)',
  ajuste_negativo: 'Ajuste (−)',
};

export const LABEL_ESTADO_LIQ: Record<EstadoLiquidacion, string> = {
  borrador: 'Borrador',
  confirmada: 'Confirmada',
  parcial: 'Parcialmente pagada',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

// Color semántico (clases del sistema) por estado de movimiento.
export const COLOR_ESTADO_MOV: Record<EstadoMovimiento, string> = {
  generada: 'bg-accent/15 text-accent',
  aprobada: 'bg-good/15 text-good',
  en_liquidacion: 'bg-warn/15 text-warn',
  pagada: 'bg-muted/15 text-muted',
  revertida: 'bg-bad/15 text-bad',
};

// Decimales de la moneda del negocio para el redondeo de comisiones.
export function decimalesMoneda(moneda: string | null | undefined): number {
  const sinDecimales = ['ARS', 'CLP', 'COP', 'PYG', 'VES', 'JPY'];
  if (moneda && sinDecimales.includes(moneda.toUpperCase())) return 0;
  return 2;
}
