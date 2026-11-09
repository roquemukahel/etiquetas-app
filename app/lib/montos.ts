// Redondeo de plata y aviso de montos anormales al cargar una venta.

// A centavos, sin arrastrar el ruido de los decimales binarios (1.005 * 100 = 100.49999...). Se usa en cada total antes de guardarlo:
// sumar varios productos con descuentos, impuesto o recargo de financiación en coma flotante dejaba totales como 158,23000000000002
// o un centavo de más ("...,01") en ventas de varios productos.
export function redondearMonto(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const signo = n < 0 ? -1 : 1;
  return (signo * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

// Un precio cargado que supera varias veces el precio de lista del mismo producto casi siempre es un error de tipeo (un cero de más,
// miles pegados): se avisa antes de confirmar la venta. No bloquea, porque a veces el precio realmente es otro.
export const FACTOR_PRECIO_ANORMAL = 3;

export type LineaParaRevisar = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  // Precios conocidos del producto o equipo (exclusivo y de lista). Una línea sin ninguno (carga manual) no se puede comparar.
  precioExclusivo?: number | null;
  precioLista?: number | null;
};

export type PrecioAnormal = { descripcion: string; precio: number; referencia: number; veces: number };

export function lineasConPrecioAnormal(lineas: LineaParaRevisar[], factor: number = FACTOR_PRECIO_ANORMAL): PrecioAnormal[] {
  const anormales: PrecioAnormal[] = [];
  for (const l of lineas) {
    const referencias = [l.precioExclusivo, l.precioLista].filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
    if (referencias.length === 0) continue;
    const referencia = Math.max(...referencias);
    if (l.precioUnitario > referencia * factor) {
      anormales.push({ descripcion: l.descripcion, precio: l.precioUnitario, referencia, veces: l.precioUnitario / referencia });
    }
  }
  return anormales;
}
