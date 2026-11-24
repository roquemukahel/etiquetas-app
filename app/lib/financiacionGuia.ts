// ============================================================
// Guía de financiación por producto: hasta cuántas cuotas se puede ofrecer.
//
//   null = sin definir (hereda de la categoría; si tampoco, no hay guía)
//   0    = sin financiación (solo pago exclusivo: contado, transferencia o débito)
//   N    = financia hasta N cuotas
//
// Resolución: el producto manda; si no tiene, la categoría; si tampoco, sin guía.
// Con varios productos en un mismo crédito, manda el de límite más bajo.
// Funciones puras (sin Supabase), para poder probarlas.
// ============================================================

export type MaxCuotas = number | null;

export function resolverMaxCuotas(propio: number | null | undefined, categoria: number | null | undefined): MaxCuotas {
  if (propio != null) return propio;
  if (categoria != null) return categoria;
  return null;
}

// El límite más bajo entre los productos que tienen guía. null = ninguno la tiene.
export function maximoDeCarrito(maximos: (number | null | undefined)[]): MaxCuotas {
  const definidos = maximos.filter((m): m is number => m != null);
  return definidos.length === 0 ? null : Math.min(...definidos);
}

// ¿Las cuotas elegidas se pasan de la guía? (con 0 = sin financiación, cualquier
// cantidad de cuotas se pasa).
export function excedeGuia(cuotas: number, max: MaxCuotas): boolean {
  if (max == null) return false;
  return cuotas > max;
}

export function textoGuia(max: MaxCuotas, t: (s: string) => string = (s) => s): string | null {
  if (max == null) return null;
  if (max === 0) return `🚫 ${t('Sin financiación')}`;
  return `💳 ${t('Hasta')} ${max} ${max === 1 ? t('cuota') : t('cuotas')}`;
}

export function mensajeAvisoGuia(max: MaxCuotas, variosProductos: boolean, t: (s: string) => string = (s) => s): string | null {
  if (max == null) return null;
  const sujeto = variosProductos ? t('El producto con el límite más bajo del crédito') : t('Este producto');
  if (max === 0) return `${sujeto} ${t('no se financia: solo pago exclusivo (contado, transferencia o débito).')}`;
  return `${sujeto} ${t('financia hasta')} ${max} ${max === 1 ? t('cuota') : t('cuotas')}.`;
}

// ---- Formulario: '' = hereda, '0' = sin financiación, 'N' = hasta N cuotas ----
export function guiaDeFormulario(valor: string): MaxCuotas {
  const v = valor.trim();
  if (v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function guiaAFormulario(max: MaxCuotas | undefined): string {
  return max == null ? '' : String(max);
}

// ---- Dos precios: exclusivo (contado/transferencia/débito) y de lista (financiación) ----
export type ItemConPrecios = { precioUnitario: number; precioExclusivo?: number | null; precioLista?: number | null };

// Precio que corresponde según cómo se paga. Sin precio de lista cargado, siempre el exclusivo.
export function precioSegunModo(exclusivo: number, lista: number | null | undefined, financiado: boolean): number {
  return financiado && lista != null && lista > 0 ? lista : exclusivo;
}

// Al activar/desactivar la financiación, pasa los ítems al precio de lista / exclusivo SOLO si
// el precio todavía es el automático del modo anterior: un precio que el vendedor tocó a mano
// no se pisa.
export function aplicarModoPrecio<T extends ItemConPrecios>(items: T[], financiado: boolean): T[] {
  return items.map((it) => {
    if (it.precioExclusivo == null || it.precioLista == null || it.precioLista <= 0) return it;
    const anterior = precioSegunModo(it.precioExclusivo, it.precioLista, !financiado);
    if (it.precioUnitario !== anterior) return it; // lo editó a mano
    return { ...it, precioUnitario: precioSegunModo(it.precioExclusivo, it.precioLista, financiado) };
  });
}
