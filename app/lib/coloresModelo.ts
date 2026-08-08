import { normalizarNombreModelo } from './modelos';

// Colores con IMAGEN por modelo. Primer modelo: iPhone 11 (imágenes propias en
// public/modelos/iphone-11, ya con el fondo recortado). El resto de los modelos
// sigue usando la paleta de colores por hex (SelectorColor); se irán agregando
// de a poco a medida que haya buenas fotos por color.
export type ColorConImagen = { nombre: string; imagen: string; hex: string };

type ModeloColores = { carpeta: string; colores: { nombre: string; archivo: string; hex: string }[] };

const IPHONE_11: ModeloColores = {
  carpeta: 'iphone-11',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f5f5f0' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#b91c2b' },
    { nombre: 'Verde', archivo: 'verde', hex: '#a3c6a8' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#f9e478' },
    { nombre: 'Púrpura', archivo: 'morado', hex: '#d0c1de' },
  ],
};

// iPhone 12 — colores oficiales de Apple. (La imagen de origen vino combinada
// y se subdividió; es de menor resolución, se ve bien en tamaño chico.)
const IPHONE_12: ModeloColores = {
  carpeta: 'iphone-12',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f7f5f0' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#d3222a' },
    { nombre: 'Verde', archivo: 'verde', hex: '#b7d9c0' },
    { nombre: 'Azul', archivo: 'azul', hex: '#2c5a8c' },
    { nombre: 'Púrpura', archivo: 'morado', hex: '#b9a9d8' },
  ],
};

// iPhone 13 — nombres oficiales de Apple (Medianoche, Blanco estrella, etc.).
const IPHONE_13: ModeloColores = {
  carpeta: 'iphone-13',
  colores: [
    { nombre: 'Medianoche', archivo: 'negro', hex: '#232a31' },
    { nombre: 'Blanco estrella', archivo: 'blanco', hex: '#f2ede4' },
    { nombre: 'Azul', archivo: 'azul', hex: '#3f6f8f' },
    { nombre: 'Rosa', archivo: 'rosa', hex: '#f4d9dc' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c1122a' },
  ],
};

// Clave de modelo normalizada: "iPhone 11", "iphone 11", "iPhone11" -> "iphone11".
const MODELOS_CON_COLOR: Record<string, ModeloColores> = {
  iphone11: IPHONE_11,
  iphone12: IPHONE_12,
  iphone13: IPHONE_13,
};

function claveModelo(modelo: string | null | undefined): string {
  return normalizarNombreModelo(modelo ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

// Devuelve los colores-con-imagen de un modelo, o null si ese modelo todavía
// usa la paleta común.
export function coloresDeModelo(modelo: string | null | undefined): ColorConImagen[] | null {
  const m = MODELOS_CON_COLOR[claveModelo(modelo)];
  if (!m) return null;
  return m.colores.map((c) => ({ nombre: c.nombre, hex: c.hex, imagen: `/modelos/${m.carpeta}/${c.archivo}.webp` }));
}

export function modeloTieneColoresConImagen(modelo: string | null | undefined): boolean {
  return coloresDeModelo(modelo) !== null;
}

// La imagen del equipo según su modelo + color (para el listado de stock).
// Devuelve null si el modelo no tiene fotos por color o el color no coincide.
export function imagenColorDeModelo(modelo: string | null | undefined, color: string | null | undefined): string | null {
  const cols = coloresDeModelo(modelo);
  const q = (color ?? '').trim().toLowerCase();
  if (!cols || !q) return null;
  const c = cols.find((c) => c.nombre.toLowerCase() === q);
  return c ? c.imagen : null;
}
