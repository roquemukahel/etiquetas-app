// Cuántas unidades hay de cada color dentro de una carpeta de modelo (ej. iPhone 13: Azul 10, Rojo 15, Verde 15, Blanco 5).
// Los colores se agrupan sin importar mayúsculas, acentos ni espacios de más ("rojo", "Rojo " y "ROJO" son el mismo).
export type ColorConCantidad = { color: string | null; cantidad: number };

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

// El que más hay primero; a igual cantidad, orden alfabético; "sin color" siempre al final.
export function resumenPorColor(items: { color: string | null }[]): ColorConCantidad[] {
  const mapa = new Map<string, ColorConCantidad>();
  for (const it of items) {
    const nombre = it.color?.trim() || null;
    const clave = nombre ? normalizar(nombre) : '';
    const actual = mapa.get(clave);
    if (actual) actual.cantidad += 1;
    else mapa.set(clave, { color: nombre, cantidad: 1 });
  }
  return Array.from(mapa.values()).sort((a, b) => {
    if (!a.color !== !b.color) return a.color ? -1 : 1;
    if (a.cantidad !== b.cantidad) return b.cantidad - a.cantidad;
    return (a.color ?? '').localeCompare(b.color ?? '', 'es');
  });
}
