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
