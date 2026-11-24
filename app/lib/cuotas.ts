// Financiación en cuotas. El interés (%) por plan se configura por negocio
// (Configuración > Financiación) y se guarda en negocios.interes_cuotas como
// un objeto {"1": 8, "3": 10, "6": 20, "12": 40}.
//
// IMPORTANTE — "Contado" NO es lo mismo que "1 cuota":
//   • Contado = paga en el momento, SIN recargo. Se guarda como cuotas = 0.
//   • 1 cuota = paga todo junto pero a ~1 mes → SÍ lleva el recargo configurado.
//   • 3/6/12 cuotas = paga en 3/6/12 meses, con su recargo.
// Por eso el interés se aplica desde 1 cuota en adelante; solo Contado (0) es
// sin interés.

export const PLANES_CUOTAS = [1, 3, 6, 12];

// Etiqueta con singular/plural ("1 cuota" vs "3 cuotas").
export function etiquetaCuotas(c: number): string {
  return `${c} cuota${c === 1 ? '' : 's'}`;
}

export type PlanCuota = { cuotas: number; interes: number };

// Planes activos (los que tienen un interés configurado, aunque sea 0).
export function planesActivos(interesCuotas: Record<string, number> | null | undefined): PlanCuota[] {
  if (!interesCuotas) return [];
  return PLANES_CUOTAS.filter((c) => interesCuotas[String(c)] != null && Number(interesCuotas[String(c)]) >= 0).map(
    (c) => ({ cuotas: c, interes: Number(interesCuotas[String(c)]) || 0 })
  );
}

// Precio final de una venta en cuotas (con el interés aplicado sobre el
// precio de contado).
export function precioFinanciado(contado: number, interes: number): number {
  return contado * (1 + (interes || 0) / 100);
}

// Cuánto sale cada cuota.
export function valorCuota(contado: number, cuotas: number, interes: number): number {
  if (!cuotas || cuotas <= 0) return contado;
  return precioFinanciado(contado, interes) / cuotas;
}

// Interés (%) de un plan puntual según la config del negocio. Contado (0, o
// cualquier valor <= 0) no tiene interés; de 1 cuota en adelante se aplica el
// recargo configurado para ese plan (1 cuota = paga a ~1 mes, no es contado).
export function interesDe(interesCuotas: Record<string, number> | null | undefined, cuotas: number): number {
  if (!interesCuotas || cuotas <= 0) return 0;
  return Number(interesCuotas[String(cuotas)]) || 0;
}

// Lo mínimo de una orden que hace falta para entender con qué plan se guardó.
export type OrdenParaCuotas = {
  cuotas: number | null;
  total: number | null;
  anticipo: number | null;
  monto_canje: number | null;
  impuesto_porcentaje: number | null;
  orden_items: { cantidad: number; precio_unitario: number }[];
};

// Interés (%) con el que se guardó una orden en cuotas, despejado de su total.
// Null si la orden no tiene plan de cuotas o no hay precio base para calcularlo.
export function interesGuardadoDeOrden(orden: OrdenParaCuotas | null): number | null {
  if (!orden || !orden.cuotas || orden.cuotas <= 0) return null;
  const subtotalOriginal = orden.orden_items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  if (subtotalOriginal <= 0) return null;
  const conImpuesto = (orden.total ?? 0) + (orden.anticipo || 0) + (orden.monto_canje || 0);
  const sinImpuesto = conImpuesto / (1 + (orden.impuesto_porcentaje || 0) / 100);
  return Math.max(0, Math.round((sinImpuesto / subtotalOriginal - 1) * 10000) / 100);
}

// La columna cuotas arranca en 1 (default de la base) para toda orden que no
// pasó por Nueva Orden — recepción de Servicio Técnico, por ejemplo — aunque
// nunca se haya elegido un plan. Una orden en "1 cuota" SIN recargo guardado
// es en la práctica de contado, y así se muestra al editarla.
export function cuotasEfectivasDeOrden(orden: OrdenParaCuotas | null): number {
  if (!orden) return 0;
  const cuotas = orden.cuotas ?? 0;
  if (cuotas === 1 && (interesGuardadoDeOrden(orden) ?? 0) <= 0) return 0;
  return cuotas;
}
