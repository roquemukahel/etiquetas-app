import { normalizarNombreModelo } from './modelos';
import { hexColorDe } from './coloresIphone';

function hexARgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function distanciaColor(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Normaliza un nombre de color: minúsculas, sin acentos, solo letras/números.
function normColor(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Equivalencias entre los nombres VIEJOS (paleta anterior, muchos en inglés) y
// los nombres NUEVOS oficiales de la config. Clave = nombre normalizado viejo,
// valor = nombre normalizado nuevo. Así un equipo guardado como "Space Gray"
// matchea con "Gris espacial", "Silver" con "Plata", "Midnight" con "Medianoche",
// etc. (Los que ya coinciden no necesitan entrada.)
const ALIAS_COLOR: Record<string, string> = {
  spacegray: 'grisespacial',
  spacegrey: 'grisespacial',
  silver: 'plata',
  gold: 'oro',
  dorado: 'oro',
  rosegold: 'ororosa',
  jetblack: 'negroazabache',
  midnight: 'medianoche',
  starlight: 'blancoestrella',
  midnightgreen: 'verdenoche',
  deeppurple: 'purpuraoscuro',
  pacificblue: 'azulpacifico',
  sierrablue: 'azulsierra',
  alpinegreen: 'verdealpino',
  graphite: 'grafito',
  spaceblack: 'negroespacial',
  blacktitanium: 'titanionegro',
  whitetitanium: 'titanioblanco',
  bluetitanium: 'titanioazul',
  naturaltitanium: 'titanionatural',
  deserttitanium: 'titaniodesierto',
  ultramarine: 'ultramar',
  teal: 'verdeazulado',
  red: 'productred',
  rojo: 'productred',
  purple: 'purpura',
  morado: 'purpura',
  green: 'verde',
  blue: 'azul',
  yellow: 'amarillo',
  pink: 'rosa',
  black: 'negro',
  white: 'blanco',
  mistblue: 'azulneblina',
  cloudwhite: 'blanconube',
  lightgold: 'oroclaro',
  skyblue: 'azulcielo',
  lavender: 'lavanda',
  sage: 'salvia',
  cosmicorange: 'naranjacosmico',
  deepblue: 'azulintenso',
};
function canonColor(nombre: string): string {
  const k = normColor(nombre);
  return ALIAS_COLOR[k] ?? k;
}

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
    { nombre: 'Verde', archivo: 'verde', hex: '#3c4a39' },
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

// iPhone 7 — colores oficiales de Apple (incluye Jet Black / Negro azabache).
const IPHONE_7: ModeloColores = {
  carpeta: 'iphone-7',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
    { nombre: 'Negro azabache', archivo: 'azabache', hex: '#0a0a0a' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e6e6e4' },
    { nombre: 'Oro', archivo: 'oro', hex: '#f0dfc0' },
    { nombre: 'Oro rosa', archivo: 'rosa', hex: '#f0cfc5' },
    { nombre: 'Product Red', archivo: 'rojo', hex: '#c41e2a' },
  ],
};

// iPhone 11 Pro / Pro Max (mismas imágenes).
const IPHONE_11_PRO: ModeloColores = {
  carpeta: 'iphone-11-pro',
  colores: [
    { nombre: 'Gris espacial', archivo: 'gris', hex: '#3b3a3c' },
    { nombre: 'Plata', archivo: 'blanco', hex: '#e8e8e6' },
    { nombre: 'Oro', archivo: 'gold', hex: '#f4e8d0' },
    { nombre: 'Verde noche', archivo: 'verde', hex: '#4e5851' },
  ],
};

// iPhone 13 Pro / Pro Max (mismas imágenes).
const IPHONE_13_PRO: ModeloColores = {
  carpeta: 'iphone-13-pro',
  colores: [
    { nombre: 'Grafito', archivo: 'grafito', hex: '#54524e' },
    { nombre: 'Oro', archivo: 'oro', hex: '#f4e2c8' },
    { nombre: 'Plata', archivo: 'plata', hex: '#e8e8e3' },
    { nombre: 'Azul Sierra', archivo: 'azul', hex: '#a6c2d6' },
    { nombre: 'Verde alpino', archivo: 'verde', hex: '#56645a' },
  ],
};

// iPhone 16e.
const IPHONE_16E: ModeloColores = {
  carpeta: 'iphone-16e',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2f3033' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#eef0ef' },
  ],
};

// iPhone Air — nombres oficiales de Apple (2025).
const IPHONE_AIR: ModeloColores = {
  carpeta: 'iphone-air',
  colores: [
    { nombre: 'Negro espacial', archivo: 'negro', hex: '#35383b' },
    { nombre: 'Blanco nube', archivo: 'blanco', hex: '#eef0ef' },
    { nombre: 'Oro claro', archivo: 'oro', hex: '#e8dcc0' },
    { nombre: 'Azul cielo', archivo: 'azul', hex: '#a9c6d8' },
  ],
};

// iPhone 17e.
const IPHONE_17E: ModeloColores = {
  carpeta: 'iphone-17e',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2f3033' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#eef0ef' },
    { nombre: 'Rosa', archivo: 'rosa', hex: '#f0d4d8' },
  ],
};

// iPhone 12 Pro / Pro Max (mismas imágenes).
const IPHONE_12_PRO: ModeloColores = {
  carpeta: 'iphone-12-pro',
  colores: [
    { nombre: 'Grafito', archivo: 'gris', hex: '#54524e' },
    { nombre: 'Plata', archivo: 'silver', hex: '#e8e8e3' },
    { nombre: 'Oro', archivo: 'gold', hex: '#f4e2c8' },
    { nombre: 'Azul Pacífico', archivo: 'azul', hex: '#3e5266' },
  ],
};

// Samsung Galaxy A32 — colores oficiales de Samsung.
const GALAXY_A32: ModeloColores = {
  carpeta: 'galaxy-a32',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f5f5f0' },
    { nombre: 'Azul', archivo: 'azul', hex: '#a9c9d8' },
    { nombre: 'Violeta', archivo: 'morado', hex: '#d9cee6' },
  ],
};

// Samsung Galaxy A07 — colores oficiales: Black, Light Violet, Green.
const GALAXY_A07: ModeloColores = {
  carpeta: 'galaxy-a07',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2c30' },
    { nombre: 'Verde', archivo: 'verde', hex: '#1f5c47' },
    { nombre: 'Violeta claro', archivo: 'violeta', hex: '#b8bdc9' },
  ],
};

// Samsung Galaxy A17 — colores oficiales: Black, Gray, Light Blue.
const GALAXY_A17: ModeloColores = {
  carpeta: 'galaxy-a17',
  colores: [
    { nombre: 'Azul claro', archivo: 'azul', hex: '#b9d6dd' },
    { nombre: 'Gris', archivo: 'gris', hex: '#a8a9ab' },
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
  ],
};

// Samsung Galaxy A26 — colores oficiales: Black, White, Mint, Peach Pink.
const GALAXY_A26: ModeloColores = {
  carpeta: 'galaxy-a26',
  colores: [
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f5f5f0' },
    { nombre: 'Menta', archivo: 'verde', hex: '#c8e8d8' },
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
  ],
};

// Samsung Galaxy A06 — colores oficiales: Black, Light Blue, Light Green.
const GALAXY_A06: ModeloColores = {
  carpeta: 'galaxy-a06',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#303947' },
    { nombre: 'Azul claro', archivo: 'azul', hex: '#e5eef9' },
    { nombre: 'Verde claro', archivo: 'verde', hex: '#d5ecd8' },
  ],
};

// Samsung Galaxy A16 — colores oficiales: Blue Black, Light Gray, Light Green.
const GALAXY_A16: ModeloColores = {
  carpeta: 'galaxy-a16',
  colores: [
    { nombre: 'Gris claro', archivo: 'gris', hex: '#d6d8d8' },
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1d21' },
    { nombre: 'Verde claro', archivo: 'verde', hex: '#c9e8dd' },
  ],
};

// Samsung Galaxy A36 — colores oficiales: Awesome Black/White/Lavender/Lime.
const GALAXY_A36: ModeloColores = {
  carpeta: 'galaxy-a36',
  colores: [
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f0f0ee' },
    { nombre: 'Lavanda', archivo: 'lavanda', hex: '#dcd7e8' },
    { nombre: 'Negro', archivo: 'negro', hex: '#3a3a3c' },
    { nombre: 'Verde lima', archivo: 'verdelima', hex: '#d6e8c8' },
  ],
};

// Samsung Galaxy A56 — colores oficiales: Awesome Graphite/Lightgray/Olive/Pink.
const GALAXY_A56: ModeloColores = {
  carpeta: 'galaxy-a56',
  colores: [
    { nombre: 'Gris claro', archivo: 'gris', hex: '#d3d5d5' },
    { nombre: 'Grafito', archivo: 'grafito', hex: '#515355' },
    { nombre: 'Rosa', archivo: 'rosa', hex: '#f0d9e0' },
    { nombre: 'Oliva', archivo: 'oliva', hex: '#c3d6c0' },
  ],
};

// Samsung Galaxy A25 — colores oficiales: Blue Black, Light Blue, Yellow, Lime Green.
const GALAXY_A25: ModeloColores = {
  carpeta: 'galaxy-a25',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2f3142' },
    { nombre: 'Azul claro', archivo: 'azul', hex: '#92a2ba' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#efe4a0' },
    { nombre: 'Verde lima', archivo: 'verdelima', hex: '#d1e1dc' },
  ],
};

// Samsung Galaxy A35 — colores oficiales: Awesome Iceblue/Lilac/Lemon/Navy.
const GALAXY_A35: ModeloColores = {
  carpeta: 'galaxy-a35',
  colores: [
    { nombre: 'Lila', archivo: 'lila', hex: '#e6d8e8' },
    { nombre: 'Azul hielo', archivo: 'azulhielo', hex: '#dce8f0' },
    { nombre: 'Azul marino', archivo: 'azulmarino', hex: '#2b2d3a' },
    { nombre: 'Limón', archivo: 'limon', hex: '#eee888' },
  ],
};

// Samsung Galaxy A55 — colores oficiales: Awesome Iceblue/Lilac/Lemon/Navy.
const GALAXY_A55: ModeloColores = {
  carpeta: 'galaxy-a55',
  colores: [
    { nombre: 'Lila', archivo: 'lila', hex: '#e6d8e8' },
    { nombre: 'Azul hielo', archivo: 'azulhielo', hex: '#dce8f0' },
    { nombre: 'Azul marino', archivo: 'azulmarino', hex: '#2b2d3a' },
    { nombre: 'Limón', archivo: 'limon', hex: '#eee888' },
  ],
};

// Samsung Galaxy A05 — colores oficiales: Black, Silver, Light Green.
const GALAXY_A05: ModeloColores = {
  carpeta: 'galaxy-a05',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1e2a24' },
    { nombre: 'Plata', archivo: 'plata', hex: '#e8e8e6' },
    { nombre: 'Verde claro', archivo: 'verdeclaro', hex: '#c9dcae' },
  ],
};

// Samsung Galaxy A15 — colores oficiales: Blue Black, Blue, Light Blue, Yellow.
const GALAXY_A15: ModeloColores = {
  carpeta: 'galaxy-a15',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#26283b' },
    { nombre: 'Azul', archivo: 'azul', hex: '#8fa8c2' },
    { nombre: 'Azul claro', archivo: 'azulclaro', hex: '#e8e4ea' },
    { nombre: 'Amarillo', archivo: 'amarillo', hex: '#eee9a0' },
  ],
};

// Samsung Galaxy A24 — colores oficiales: Black, Dark Red, Light Green, Silver.
const GALAXY_A24: ModeloColores = {
  carpeta: 'galaxy-a24',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Plata', archivo: 'plata', hex: '#d6e0dc' },
    { nombre: 'Verde claro', archivo: 'verdeclaro', hex: '#d4e8b8' },
  ],
};

// Samsung Galaxy A34 — colores oficiales: Awesome Lime/Graphite/Silver/Violet.
const GALAXY_A34: ModeloColores = {
  carpeta: 'galaxy-a34',
  colores: [
    { nombre: 'Plata', archivo: 'plata', hex: '#dce4dc' },
    { nombre: 'Verde lima', archivo: 'verdelima', hex: '#d8e8a0' },
    { nombre: 'Grafito', archivo: 'grafito', hex: '#28292c' },
    { nombre: 'Violeta', archivo: 'violeta', hex: '#a89ce0' },
  ],
};

// Samsung Galaxy A54 — colores oficiales: Awesome Lime/Graphite/Violet/White.
const GALAXY_A54: ModeloColores = {
  carpeta: 'galaxy-a54',
  colores: [
    { nombre: 'Blanco', archivo: 'blanco', hex: '#f0f0ee' },
    { nombre: 'Grafito', archivo: 'grafito', hex: '#2c2c2e' },
    { nombre: 'Verde lima', archivo: 'verdelima', hex: '#d8eab0' },
  ],
};

// Samsung Galaxy S26 (mismas fotos para S26, S26+ y S26 Ultra, a pedido del
// usuario). Colores oficiales: Black, White, Cobalt Violet, Sky Blue +
// online-exclusive Silver Shadow y Pink Gold.
const GALAXY_S26: ModeloColores = {
  carpeta: 'galaxy-s26',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#3a3a3c' },
    { nombre: 'Blanco', archivo: 'blanco', hex: '#eef0ef' },
    { nombre: 'Violeta cobalto', archivo: 'violeta', hex: '#5f5a86' },
    { nombre: 'Azul cielo', archivo: 'azulcielo', hex: '#c7dced' },
    { nombre: 'Plata', archivo: 'plata', hex: '#c6c8ca' },
    { nombre: 'Oro rosa', archivo: 'orosa', hex: '#f2ded0' },
  ],
};

// Samsung Galaxy S25 — colores oficiales: Navy, Mint, Icyblue, Silver Shadow.
const GALAXY_S25: ModeloColores = {
  carpeta: 'galaxy-s25',
  colores: [
    { nombre: 'Plata', archivo: 'plata', hex: '#a8abae' },
    { nombre: 'Azul marino', archivo: 'azulmarino', hex: '#2b3d5c' },
    { nombre: 'Azul hielo', archivo: 'azulhielo', hex: '#c9d6e8' },
  ],
};

// Samsung Galaxy S24 — colores oficiales: Onyx Black, Marble Gray, Amber
// Yellow, Cobalt Violet.
const GALAXY_S24: ModeloColores = {
  carpeta: 'galaxy-s24',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#3a3a3a' },
    { nombre: 'Gris mármol', archivo: 'gris', hex: '#d4d2ce' },
    { nombre: 'Violeta cobalto', archivo: 'violeta', hex: '#87829c' },
    { nombre: 'Ámbar', archivo: 'amarillo', hex: '#f0e6b8' },
  ],
};

// Samsung Galaxy S24 FE — colores oficiales: Blue, Marble Gray, Graphite, Mint.
const GALAXY_S24_FE: ModeloColores = {
  carpeta: 'galaxy-s24-fe',
  colores: [
    { nombre: 'Grafito', archivo: 'grafito', hex: '#3a3a3c' },
    { nombre: 'Gris mármol', archivo: 'gris', hex: '#e8e6e0' },
    { nombre: 'Azul', archivo: 'azul', hex: '#c3d8ec' },
  ],
};

// Samsung Galaxy S23 — colores oficiales: Phantom Black, Green, Cream,
// Lavender + exclusivo online Lime.
const GALAXY_S23: ModeloColores = {
  carpeta: 'galaxy-s23',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Verde', archivo: 'verde', hex: '#5c6650' },
    { nombre: 'Lavanda', archivo: 'lavanda', hex: '#e0d4e0' },
    { nombre: 'Lima', archivo: 'lima', hex: '#e2eab0' },
  ],
};

// Samsung Galaxy S23 Ultra — mismos nombres de color que el S23 (Phantom
// Black/Cream/Green/Lavender) pero diseño físico distinto (bordes planos,
// cámara individual, S-Pen), así que NO comparte fotos con el S23 base.
const GALAXY_S23_ULTRA: ModeloColores = {
  carpeta: 'galaxy-s23-ultra',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Crema', archivo: 'crema', hex: '#ede4d3' },
    { nombre: 'Verde', archivo: 'verde', hex: '#4a5c4e' },
    { nombre: 'Lavanda', archivo: 'lavanda', hex: '#e6d9e6' },
  ],
};

// Redmi 15C — colores oficiales: Midnight Black, Mint Green, Dusk Purple,
// Moonlight Blue.
const REDMI_15C: ModeloColores = {
  carpeta: 'redmi-15c',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#2b2b2d' },
    { nombre: 'Verde menta', archivo: 'verde', hex: '#a8d0c8' },
    { nombre: 'Púrpura', archivo: 'purpura', hex: '#e8b8a8' },
    { nombre: 'Azul', archivo: 'azul', hex: '#3a5ea8' },
  ],
};

// Samsung Galaxy A14 — colores oficiales: Black, Light Green, Dark Red, Silver.
const GALAXY_A14: ModeloColores = {
  carpeta: 'galaxy-a14',
  colores: [
    { nombre: 'Negro', archivo: 'negro', hex: '#1c1c1e' },
    { nombre: 'Plata', archivo: 'plata', hex: '#d6d8da' },
    { nombre: 'Verde claro', archivo: 'verdeclaro', hex: '#d0e0ae' },
  ],
};

// Clave de modelo normalizada: "iPhone 11", "iphone 11", "iPhone11" -> "iphone11".
const MODELOS_CON_COLOR: Record<string, ModeloColores> = {
  iphone7: IPHONE_7,
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
  iphone11pro: IPHONE_11_PRO,
  iphone11promax: IPHONE_11_PRO,
  iphone12: IPHONE_12,
  iphone12mini: IPHONE_12,
  iphone12pro: IPHONE_12_PRO,
  iphone12promax: IPHONE_12_PRO,
  iphone13: IPHONE_13,
  iphone13mini: IPHONE_13,
  iphone13pro: IPHONE_13_PRO,
  iphone13promax: IPHONE_13_PRO,
  iphone14: IPHONE_14,
  iphone14plus: IPHONE_14,
  iphone14pro: IPHONE_14_PRO,
  iphone14promax: IPHONE_14_PRO,
  iphone15: IPHONE_15,
  iphone15plus: IPHONE_15,
  iphone15pro: IPHONE_15_PRO,
  iphone15promax: IPHONE_15_PRO,
  iphone16: IPHONE_16,
  iphone16plus: IPHONE_16,
  iphone16pro: IPHONE_16_PRO,
  iphone16promax: IPHONE_16_PRO,
  iphone16e: IPHONE_16E,
  iphone17: IPHONE_17,
  iphone17pro: IPHONE_17_PRO,
  iphone17promax: IPHONE_17_PRO,
  iphone17e: IPHONE_17E,
  iphoneair: IPHONE_AIR,
  galaxya32: GALAXY_A32,
  galaxya07: GALAXY_A07,
  galaxya17: GALAXY_A17,
  galaxya26: GALAXY_A26,
  galaxya06: GALAXY_A06,
  galaxya16: GALAXY_A16,
  galaxya36: GALAXY_A36,
  galaxya56: GALAXY_A56,
  galaxya25: GALAXY_A25,
  galaxya35: GALAXY_A35,
  galaxya55: GALAXY_A55,
  galaxya05: GALAXY_A05,
  galaxya15: GALAXY_A15,
  galaxya24: GALAXY_A24,
  galaxya34: GALAXY_A34,
  galaxya54: GALAXY_A54,
  galaxys26: GALAXY_S26,
  'galaxys26+': GALAXY_S26,
  galaxys26ultra: GALAXY_S26,
  galaxys25: GALAXY_S25,
  'galaxys25+': GALAXY_S25,
  galaxys24: GALAXY_S24,
  'galaxys24+': GALAXY_S24,
  galaxys24fe: GALAXY_S24_FE,
  galaxys23: GALAXY_S23,
  'galaxys23+': GALAXY_S23,
  galaxys23ultra: GALAXY_S23_ULTRA,
  redmi15c: REDMI_15C,
  galaxya14: GALAXY_A14,
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
  const q = (color ?? '').trim();
  if (!cols || !q) return null;
  const ql = q.toLowerCase();
  // 1) Match exacto por nombre (equipos cargados con el selector nuevo).
  const exacto = cols.find((c) => c.nombre.toLowerCase() === ql);
  if (exacto) return exacto.imagen;
  // 2) Match por nombre canónico: los equipos viejos guardaron el color con los
  //    nombres de la paleta anterior ("Space Gray", "Silver", "Midnight"...),
  //    distintos de los oficiales de la config ("Gris espacial", "Plata",
  //    "Medianoche"). ALIAS_COLOR unifica ambos.
  const canonQ = canonColor(q);
  const porCanon = cols.find((c) => canonColor(c.nombre) === canonQ);
  if (porCanon) return porCanon.imagen;
  // 3) Último recurso: color más parecido por hex (para nombres que el alias no
  //    cubre, p.ej. "Blanco"→"Blanco estrella"). Umbral chico para no asignar
  //    una foto equivocada si el color guardado es raro/ajeno al modelo.
  const hexGuardado = hexColorDe(q);
  if (!hexGuardado) return null;
  const objetivo = hexARgb(hexGuardado);
  let mejor: ColorConImagen | null = null;
  let mejorDist = Infinity;
  for (const c of cols) {
    const d = distanciaColor(objetivo, hexARgb(c.hex));
    if (d < mejorDist) {
      mejorDist = d;
      mejor = c;
    }
  }
  return mejor && mejorDist <= 40 ? mejor.imagen : null;
}
