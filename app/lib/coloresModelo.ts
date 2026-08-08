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

// iPhone 14 (render angulado sobre fondo claro). Falta Amarillo (Apple lo
// agregó en 2023): cuando haya imagen se suma.
const IPHONE_14: ModeloColores = {
  carpeta: 'iphone-14',
  colores: [
    { nombre: 'Medianoche', archivo: 'negro', hex: '#232a2f' },
    { nombre: 'Blanco estrella', archivo: 'blanco', hex: '#f4f0e8' },
    { nombre: 'Azul', archivo: 'celeste', hex: '#a7c0d8' },
    { nombre: 'Púrpura', archivo: 'morado', hex: '#e6ddef' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#d02b2b' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#f5d33f' },
  ],
};

// iPhone 8 Plus — colores oficiales de Apple.
const IPHONE_8_PLUS: ModeloColores = {
  carpeta: 'iphone-8-plus',
  colores: [
    { nombre: 'Gris espacial', archivo: 'negro', hex: '#3b3a38' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8e8e6' },
    { nombre: 'Oro', archivo: 'oro', hex: '#eecfc0' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c41e2a' },
  ],
};

// iPhone 8 — mismos colores que el 8 Plus.
const IPHONE_8: ModeloColores = {
  carpeta: 'iphone-8',
  colores: [
    { nombre: 'Gris espacial', archivo: 'negro', hex: '#3b3a38' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8e8e6' },
    { nombre: 'Oro', archivo: 'oro', hex: '#eecfc0' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c41e2a' },
  ],
};

// iPhone 7 Plus — colores oficiales de Apple (incluye Jet Black / Negro azabache).
const IPHONE_7_PLUS: ModeloColores = {
  carpeta: 'iphone-7-plus',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
    { nombre: 'Negro azabache', archivo: 'azabache', hex: '#0a0a0a' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e6e6e4' },
    { nombre: 'Oro', archivo: 'oro', hex: '#f0dfc0' },
    { nombre: 'Oro rosa', archivo: 'rosa', hex: '#f0cfc5' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c41e2a' },
  ],
};

// iPhone 14 Pro / Pro Max (mismas imágenes para los dos, a pedido del usuario).
const IPHONE_14_PRO: ModeloColores = {
  carpeta: 'iphone-14-pro',
  colores: [
    { nombre: 'Negro espacial', archivo: 'gris', hex: '#35383b' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#eef1f1' },
    { nombre: 'Oro', archivo: 'gold', hex: '#f7e7c8' },
    { nombre: 'Púrpura oscuro', archivo: 'morado', hex: '#4b455a' },
  ],
};

// iPhone 15 — nombres simples de Apple.
const IPHONE_15: ModeloColores = {
  carpeta: 'iphone-15',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2f3033' },
    { nombre: 'Azul', archivo: 'azul', hex: '#bcd0d4' },
    { nombre: 'Verde', archivo: 'verde', hex: '#cdd6cc' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#efe6c9' },
    { nombre: 'Rosa', archivo: 'rosa', hex: '#f0d4d8' },
  ],
};

// iPhone 15 Pro / Pro Max (mismas imágenes para los dos).
const IPHONE_15_PRO: ModeloColores = {
  carpeta: 'iphone-15-pro',
  colores: [
    { nombre: 'Titanio negro', archivo: 'titanionegro', hex: '#3b3b3d' },
    { nombre: 'Titanio blanco', archivo: 'titanioblanco', hex: '#e8e8e3' },
    { nombre: 'Titanio azul', archivo: 'titanioazul', hex: '#3f4c5a' },
    { nombre: 'Titanio natural', archivo: 'titanionatural', hex: '#8f8a80' },
  ],
};

// iPhone 16 — nombres oficiales de Apple (Ultramar, Verde azulado, etc.).
const IPHONE_16: ModeloColores = {
  carpeta: 'iphone-16',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#35393b' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#eef0ef' },
    { nombre: 'Rosa', archivo: 'rosa', hex: '#f4d9dd' },
    { nombre: 'Verde azulado', archivo: 'verde', hex: '#a8c4c0' },
    { nombre: 'Ultramar', archivo: 'azul', hex: '#4a4fb0' },
  ],
};

// iPhone 16 Pro / Pro Max (mismas imágenes para los dos).
const IPHONE_16_PRO: ModeloColores = {
  carpeta: 'iphone-16-pro',
  colores: [
    { nombre: 'Titanio negro', archivo: 'titanionegro', hex: '#3a3a3c' },
    { nombre: 'Titanio blanco', archivo: 'titanioblanco', hex: '#e5e4df' },
    { nombre: 'Titanio natural', archivo: 'titanionatural', hex: '#b8b0a4' },
    { nombre: 'Titanio desierto', archivo: 'titaniodesierto', hex: '#bda07f' },
  ],
};

// iPhone 17 — nombres oficiales de Apple (2025).
const IPHONE_17: ModeloColores = {
  carpeta: 'iphone-17',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2f3033' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#eef0ef' },
    { nombre: 'Azul neblina', archivo: 'azulneblina', hex: '#c5d3dd' },
    { nombre: 'Lavanda', archivo: 'lavanda', hex: '#d9d3e6' },
    { nombre: 'Salvia', archivo: 'salvia', hex: '#c3ccb8' },
  ],
};

// iPhone 17 Pro / Pro Max (mismas imágenes para los dos).
const IPHONE_17_PRO: ModeloColores = {
  carpeta: 'iphone-17-pro',
  colores: [
    { nombre: 'Azul intenso', archivo: 'azul', hex: '#2a3f66' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8eae9' },
    { nombre: 'Naranja cósmico', archivo: 'naranja', hex: '#e06a2b' },
  ],
};

// iPhone X — 2 colores oficiales.
const IPHONE_X: ModeloColores = {
  carpeta: 'iphone-x',
  colores: [
    { nombre: 'Gris espacial', archivo: 'negro', hex: '#3b3a3c' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8e8e6' },
  ],
};

// iPhone XR — 6 colores oficiales.
const IPHONE_XR: ModeloColores = {
  carpeta: 'iphone-xr',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1f1f21' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f2f0ec' },
    { nombre: 'Azul', archivo: 'celeste', hex: '#a7c4d6' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#f4cf4e' },
    { nombre: 'Coral', archivo: 'coral', hex: '#f38b6b' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c8202f' },
  ],
};

// iPhone XS / XS Max (mismas imágenes).
const IPHONE_XS: ModeloColores = {
  carpeta: 'iphone-xs',
  colores: [
    { nombre: 'Gris espacial', archivo: 'negro', hex: '#3b3a3c' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8e8e6' },
    { nombre: 'Oro', archivo: 'oro', hex: '#e5c9a8' },
  ],
};

// iPhone SE (mismas imágenes para 2020 y 2022; solo cambian los nombres Apple).
const IPHONE_SE_2020: ModeloColores = {
  carpeta: 'iphone-se',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f2f0ec' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c8202f' },
  ],
};
const IPHONE_SE_2022: ModeloColores = {
  carpeta: 'iphone-se',
  colores: [
    { nombre: 'Medianoche', archivo: 'negro', hex: '#232a31' },
    { nombre: 'Blanco estrella', archivo: 'blanco', hex: '#f2ede4' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c8202f' },
  ],
};

// Clave de modelo normalizada: "iPhone 11", "iphone 11", "iPhone11" -> "iphone11".
const MODELOS_CON_COLOR: Record<string, ModeloColores> = {
  iphonex: IPHONE_X,
  iphonexr: IPHONE_XR,
  iphonexs: IPHONE_XS,
  iphonexsmax: IPHONE_XS,
  'iphonese(2020)': IPHONE_SE_2020,
  'iphonese(2022)': IPHONE_SE_2022,
  iphone7plus: IPHONE_7_PLUS,
  iphone8: IPHONE_8,
  iphone8plus: IPHONE_8_PLUS,
  iphone11: IPHONE_11,
  iphone12: IPHONE_12,
  iphone13: IPHONE_13,
  iphone14: IPHONE_14,
  iphone14pro: IPHONE_14_PRO,
  iphone14promax: IPHONE_14_PRO,
  iphone15: IPHONE_15,
  iphone15pro: IPHONE_15_PRO,
  iphone15promax: IPHONE_15_PRO,
  iphone16: IPHONE_16,
  iphone16pro: IPHONE_16_PRO,
  iphone16promax: IPHONE_16_PRO,
  iphone17: IPHONE_17,
  iphone17pro: IPHONE_17_PRO,
  iphone17promax: IPHONE_17_PRO,
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
