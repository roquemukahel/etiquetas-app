// ============================================================
// Módulo Caja — capa de datos PURA (sin Supabase). Recibe los pagos ya
// filtrados por caja+sucursal+rango de fechas (eso lo hace servicio.ts) y
// solo suma. Mismo criterio que app/estadisticas/datos.ts: la lógica de
// negocio se testea sin tocar la base.
// ============================================================

export type MedioCaja = 'efectivo' | 'transferencia' | 'debito' | 'credito';
export const MEDIOS_CAJA: MedioCaja[] = ['efectivo', 'transferencia', 'debito', 'credito'];

export type TipoCaja = 'venta_diaria' | 'financiamiento';

export type PagoParaCaja = { medio: string; monto: number; moneda: string };

export type TotalesPorMedio = Record<MedioCaja | 'otro', number>;

// Otros medios (cheque/usdt) no tienen su propia columna en el arqueo —
// entran en "otro" para no perderlos de la suma general, pero no cuentan
// para el efectivo esperado (solo "efectivo" cuenta como caja física).
export function totalesPorMedio(pagos: PagoParaCaja[]): TotalesPorMedio {
  const totales: TotalesPorMedio = { efectivo: 0, transferencia: 0, debito: 0, credito: 0, otro: 0 };
  for (const p of pagos) {
    const clave = (MEDIOS_CAJA as string[]).includes(p.medio) ? (p.medio as MedioCaja) : 'otro';
    totales[clave] += p.monto || 0;
  }
  return totales;
}

export function totalGeneral(totales: TotalesPorMedio): number {
  return totales.efectivo + totales.transferencia + totales.debito + totales.credito + totales.otro;
}

// Efectivo esperado en el cajón: lo que había al abrir + lo que entró en
// efectivo durante el turno. Transferencia/débito/crédito no pasan por el
// cajón físico, por eso no suman acá (sí en el total general de arriba).
export function efectivoEsperado(efectivoInicial: number, totalEfectivoPeriodo: number): number {
  return efectivoInicial + totalEfectivoPeriodo;
}

export function diferenciaArqueo(declarado: number, esperado: number): number {
  return declarado - esperado;
}

// A qué caja pertenece el pago de una venta, según si la venta generó
// deuda (cuenta corriente / financiación propia) o se cobró íntegra en el
// momento — pedido explícito del cliente: "Financiación propia y cuenta
// corriente deben aparecer como métodos de pago al generar una venta.
// Sin embargo, el cierre debe diferenciar el saldo financiado del dinero
// realmente cobrado" y el ANTICIPO de un crédito nuevo va a Financiamiento,
// no a Venta diaria. montoCuentaCorriente > 0 cubre los dos casos (con o
// sin cronograma de cuotas propio) porque ambos dejan deuda.
export function cajaDeVenta(montoCuentaCorriente: number): TipoCaja {
  return montoCuentaCorriente > 0.009 ? 'financiamiento' : 'venta_diaria';
}

// Un pago que se registra DESPUÉS de la venta (cobrar una cuota vieja, un
// abono de cuenta corriente) siempre es plata de Financiamiento — nunca
// hay ambigüedad acá, a diferencia del pago en el momento de vender.
export const CAJA_DE_COBRANZA: TipoCaja = 'financiamiento';

export const NOMBRE_CAJA: Record<TipoCaja, string> = {
  venta_diaria: 'Venta diaria',
  financiamiento: 'Financiamiento',
};
