import type { ItemProductoR } from './datos';

// Ranking COMPLETO de productos (no solo el top 10) para bajar Categoría → Subcategoría → Producto en Estadísticas. Es el mismo cálculo que
// los rankings de barras (ItemProductoR → agrupar → ganancia / margen), pero conservando el costo y todas las filas, para ordenar por cualquier
// columna y exportar. La ganancia y el margen solo cuentan las unidades que tienen costo cargado (igual que en el resto de Estadísticas).

export type ColumnaRanking = 'nombre' | 'unidades' | 'facturacion' | 'costo' | 'ganancia' | 'margen';

export type FilaRankingCompleta = {
  clave: string;
  nombre: string;
  unidades: number;
  facturacion: number;
  // Costo de las unidades que tienen costo cargado; null si ninguna lo tiene.
  costo: number | null;
  ganancia: number | null;
  margen: number | null;
};

export const SIN_SUBCATEGORIA = 'Sin subcategoría';

type Acumulador = { nombre: string; unidades: number; facturacion: number; costo: number; facturacionConCosto: number; tieneCosto: boolean };

export function agruparRanking(items: ItemProductoR[], clave: (it: ItemProductoR) => string, nombre: (it: ItemProductoR) => string): FilaRankingCompleta[] {
  const mapa = new Map<string, Acumulador>();
  for (const it of items) {
    const k = clave(it);
    const e = mapa.get(k) ?? { nombre: nombre(it), unidades: 0, facturacion: 0, costo: 0, facturacionConCosto: 0, tieneCosto: false };
    e.unidades += it.cantidad;
    e.facturacion += it.precio_unitario * it.cantidad;
    if (it.costo != null) {
      e.costo += it.costo * it.cantidad;
      e.facturacionConCosto += it.precio_unitario * it.cantidad;
      e.tieneCosto = true;
    }
    mapa.set(k, e);
  }
  return Array.from(mapa.entries()).map(([k, e]) => {
    const ganancia = e.tieneCosto ? e.facturacionConCosto - e.costo : null;
    return {
      clave: k,
      nombre: e.nombre,
      unidades: e.unidades,
      facturacion: e.facturacion,
      costo: e.tieneCosto ? e.costo : null,
      ganancia,
      margen: ganancia != null && e.facturacionConCosto > 0.009 ? (ganancia / e.facturacionConCosto) * 100 : null,
    };
  });
}

// Una fila por producto (clave estable de catálogo / modelo).
export function rankingProductosCompleto(items: ItemProductoR[]): FilaRankingCompleta[] {
  return agruparRanking(items, (it) => it.clave, (it) => it.nombre);
}

// Una fila por categoría (de primer nivel).
export function rankingCategoriasCompleto(items: ItemProductoR[]): FilaRankingCompleta[] {
  return agruparRanking(items, (it) => it.categoriaNombre, (it) => it.categoriaNombre);
}

// Una fila por subcategoría dentro de una categoría; lo que está directo en la categoría (sin subcategoría) va junto como "Sin subcategoría".
export function rankingSubcategoriasCompleto(items: ItemProductoR[], categoria: string): FilaRankingCompleta[] {
  return agruparRanking(
    items.filter((it) => it.categoriaNombre === categoria),
    (it) => it.subcategoriaNombre ?? SIN_SUBCATEGORIA,
    (it) => it.subcategoriaNombre ?? SIN_SUBCATEGORIA
  );
}

// ¿Esta categoría vendió algo en alguna subcategoría? (para decidir si hay un nivel intermedio que mostrar)
export function categoriaTieneSubcategorias(items: ItemProductoR[], categoria: string): boolean {
  return items.some((it) => it.categoriaNombre === categoria && !!it.subcategoriaNombre);
}

export type FiltroRanking = { categoria?: string | null; subcategoria?: string | null };

export function filtrarItemsRanking(items: ItemProductoR[], f: FiltroRanking): ItemProductoR[] {
  return items.filter((it) => {
    if (f.categoria && it.categoriaNombre !== f.categoria) return false;
    if (f.subcategoria) {
      const sub = it.subcategoriaNombre ?? SIN_SUBCATEGORIA;
      if (sub !== f.subcategoria) return false;
    }
    return true;
  });
}

// Ordena por la columna elegida. Los vacíos (sin costo cargado) siempre quedan al final, sin importar el sentido. Empate → por nombre.
export function ordenarRanking(filas: FilaRankingCompleta[], columna: ColumnaRanking, descendente: boolean): FilaRankingCompleta[] {
  const dir = descendente ? -1 : 1;
  return [...filas].sort((a, b) => {
    if (columna === 'nombre') return dir * a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    const va = a[columna];
    const vb = b[columna];
    if (va == null && vb == null) return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return dir * (va - vb);
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });
}

export function totalDeFilas(filas: FilaRankingCompleta[]): { unidades: number; facturacion: number; costo: number | null; ganancia: number | null } {
  let unidades = 0;
  let facturacion = 0;
  let costo = 0;
  let ganancia = 0;
  let hay = false;
  for (const f of filas) {
    unidades += f.unidades;
    facturacion += f.facturacion;
    if (f.costo != null) {
      costo += f.costo;
      hay = true;
    }
    if (f.ganancia != null) ganancia += f.ganancia;
  }
  return { unidades, facturacion, costo: hay ? costo : null, ganancia: hay ? ganancia : null };
}

// Una fórmula que empieza con = + - @ se ejecutaría sola en Excel: el nombre de un producto es texto libre.
export function celdaCSV(v: string): string {
  const esFormula = /^[=+\-@]/.test(v);
  return `"${(esFormula ? "'" : '') + v.replace(/"/g, '""')}"`;
}

const redondear = (n: number | null) => (n == null ? '' : String(Math.round(n)));

// Mismas filas para el CSV y el PDF. Sin permiso para ver costos no salen las columnas de costo, ganancia ni margen.
export function encabezadosRanking(conCostos: boolean, etiquetaPrimera: string): string[] {
  return [etiquetaPrimera, 'Unidades', 'Facturación', ...(conCostos ? ['Costo', 'Ganancia', 'Margen %'] : [])];
}

export function filasParaExportar(filas: FilaRankingCompleta[], conCostos: boolean): string[][] {
  return filas.map((f) => [
    f.nombre,
    String(f.unidades),
    redondear(f.facturacion),
    ...(conCostos ? [redondear(f.costo), redondear(f.ganancia), f.margen == null ? '' : f.margen.toFixed(1)] : []),
  ]);
}

export function armarCSVRanking(filas: FilaRankingCompleta[], conCostos: boolean, etiquetaPrimera: string): string {
  const encabezado = encabezadosRanking(conCostos, etiquetaPrimera).map(celdaCSV).join(',');
  const cuerpo = filasParaExportar(filas, conCostos).map((fila) => fila.map(celdaCSV).join(','));
  return [encabezado, ...cuerpo].join('\n');
}
