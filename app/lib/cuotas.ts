// Financiación en cuotas. El interés (%) por plan se configura por negocio
// (Configuración > Financiación) y se guarda en negocios.interes_cuotas como
// un objeto {"3": 10, "6": 20, "12": 40}. Contado (1 cuota) siempre existe y
// no tiene interés.

export const PLANES_CUOTAS = [3, 6, 12];

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

// Interés (%) de un plan puntual según la config del negocio.
export function interesDe(interesCuotas: Record<string, number> | null | undefined, cuotas: number): number {
  if (!interesCuotas || cuotas <= 1) return 0;
  return Number(interesCuotas[String(cuotas)]) || 0;
}
