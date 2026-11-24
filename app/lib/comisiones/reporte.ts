import { etiquetaCategoria, ubicarCategoria, type CategoriaArbol } from '../subcategorias';

// Reporte de comisiones agrupado por categoría y por vendedor (panel de Comisiones). Funciones puras: reciben los movimientos ya
// filtrados por fecha y sucursal y el árbol de categorías, y devuelven filas anidadas.

export const SIN_CATEGORIA_COMISION = 'Sin categoría';
export const AJUSTES_COMISION = 'Ajustes manuales';

export type MovimientoReporte = {
  vendedor_id: string;
  vendedor: string;
  tipo_movimiento: string; // comision | reversion | ajuste_positivo | ajuste_negativo
  categoria_id: string | null;
  comision: number;
  base: number;
};

export type FilaReporte = {
  clave: string;
  nombre: string;
  comision: number;
  // Base sobre la que se calculó (ventas comisionadas); en reversiones y ajustes es 0.
  base: number;
  hijos: FilaReporte[];
};

export type ModoReporte = 'categoria' | 'vendedor';

type Acumulado = { clave: string; nombre: string; comision: number; base: number; hijos: Map<string, Acumulado> };

const nuevo = (clave: string, nombre: string): Acumulado => ({ clave, nombre, comision: 0, base: 0, hijos: new Map() });

function sumar(a: Acumulado, comision: number, base: number) {
  a.comision += comision;
  a.base += base;
}

function aFilas(m: Map<string, Acumulado>): FilaReporte[] {
  return Array.from(m.values())
    .map((a) => ({ clave: a.clave, nombre: a.nombre, comision: redondear2(a.comision), base: redondear2(a.base), hijos: aFilas(a.hijos) }))
    .sort((x, y) => y.comision - x.comision || x.nombre.localeCompare(y.nombre, 'es'));
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

// Nombre (y clave) de la categoría de un movimiento. Los ajustes manuales no son de ninguna categoría y van aparte.
function categoriaDe(mov: MovimientoReporte, categorias: CategoriaArbol[], separarSubcategorias: boolean): { clave: string; nombre: string } {
  if (mov.tipo_movimiento === 'ajuste_positivo' || mov.tipo_movimiento === 'ajuste_negativo') return { clave: '__ajustes__', nombre: AJUSTES_COMISION };
  if (!mov.categoria_id) return { clave: '__sin__', nombre: SIN_CATEGORIA_COMISION };
  const u = ubicarCategoria(mov.categoria_id, categorias);
  if (!u.categoria) return { clave: '__eliminada__', nombre: 'Categoría eliminada' };
  if (separarSubcategorias && u.subcategoria) return { clave: u.subcategoria.id, nombre: etiquetaCategoria(u.subcategoria.id, categorias) };
  return { clave: u.categoria.id, nombre: u.categoria.nombre };
}

// 'categoria': categoría › vendedor. 'vendedor': vendedor › categoría. Con `separarSubcategorias` cada subcategoría es su propia fila
// ("Accesorios › Cables"); sin eso se suman a la categoría de arriba.
export function agruparComisiones(movs: MovimientoReporte[], categorias: CategoriaArbol[], modo: ModoReporte, separarSubcategorias = false): FilaReporte[] {
  const raiz = new Map<string, Acumulado>();
  for (const mv of movs) {
    const cat = categoriaDe(mv, categorias, separarSubcategorias);
    const vend = { clave: mv.vendedor_id, nombre: mv.vendedor };
    const [nivel1, nivel2] = modo === 'categoria' ? [cat, vend] : [vend, cat];
    // Una reversión resta comisión pero no es una venta nueva: su base no se suma (evita contar dos veces lo vendido).
    const base = mv.tipo_movimiento === 'comision' ? mv.base : 0;
    const a1 = raiz.get(nivel1.clave) ?? nuevo(nivel1.clave, nivel1.nombre);
    raiz.set(nivel1.clave, a1);
    sumar(a1, mv.comision, base);
    const a2 = a1.hijos.get(nivel2.clave) ?? nuevo(nivel2.clave, nivel2.nombre);
    a1.hijos.set(nivel2.clave, a2);
    sumar(a2, mv.comision, base);
  }
  return aFilas(raiz);
}

export function totalReporte(filas: FilaReporte[]): { comision: number; base: number } {
  return { comision: redondear2(filas.reduce((a, f) => a + f.comision, 0)), base: redondear2(filas.reduce((a, f) => a + f.base, 0)) };
}

// Para el CSV: una fila por (primer nivel, segundo nivel).
export function aplanarReporte(filas: FilaReporte[]): { nivel1: string; nivel2: string; comision: number; base: number }[] {
  const salida: { nivel1: string; nivel2: string; comision: number; base: number }[] = [];
  for (const f of filas) for (const h of f.hijos) salida.push({ nivel1: f.nombre, nivel2: h.nombre, comision: h.comision, base: h.base });
  return salida;
}
