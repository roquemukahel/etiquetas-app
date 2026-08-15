export const MARCAS_DISPONIBLES = [
  { id: 'iphone', nombre: 'iPhone' },
  { id: 'samsung', nombre: 'Samsung' },
  { id: 'xiaomi', nombre: 'Xiaomi' },
  { id: 'otras', nombre: 'Otras marcas' },
];

// Listas de modelos "canónicos" (nombre y formato consistente) que se
// cargan como carpetas de Stock apenas el negocio elige trabajar con
// esa marca. La idea es que la gente elija de un desplegable en vez de
// escribir el modelo a mano y terminar con carpetas duplicadas por una
// mayúscula o un espacio de más (ej. "iPhone 13 Pro" vs "iphone 13 pro").
// "Otras marcas" no tiene catálogo: esas carpetas se siguen cargando a mano.
export const CATALOGO_MODELOS: Record<string, string[]> = {
  iphone: [
    'iPhone 7',
    'iPhone 7 Plus',
    'iPhone 8',
    'iPhone 8 Plus',
    'iPhone X',
    'iPhone XR',
    'iPhone XS',
    'iPhone XS Max',
    'iPhone 11',
    'iPhone 11 Pro',
    'iPhone 11 Pro Max',
    'iPhone SE (2020)',
    'iPhone 12',
    'iPhone 12 mini',
    'iPhone 12 Pro',
    'iPhone 12 Pro Max',
    'iPhone 13',
    'iPhone 13 mini',
    'iPhone 13 Pro',
    'iPhone 13 Pro Max',
    'iPhone SE (2022)',
    'iPhone 14',
    'iPhone 14 Plus',
    'iPhone 14 Pro',
    'iPhone 14 Pro Max',
    'iPhone 15',
    'iPhone 15 Plus',
    'iPhone 15 Pro',
    'iPhone 15 Pro Max',
    'iPhone 16',
    'iPhone 16 Plus',
    'iPhone 16 Pro',
    'iPhone 16 Pro Max',
    'iPhone 16e',
    'iPhone 17',
    'iPhone 17 Pro',
    'iPhone 17 Pro Max',
    'iPhone 17e',
    'iPhone Air',
  ],
  samsung: [
    'Galaxy S8',
    'Galaxy S8+',
    'Galaxy S9',
    'Galaxy S9+',
    'Galaxy Note 9',
    'Galaxy S10',
    'Galaxy S10+',
    'Galaxy S10e',
    'Galaxy Note 10',
    'Galaxy Note 10+',
    'Galaxy S20',
    'Galaxy S20+',
    'Galaxy S20 Ultra',
    'Galaxy Note 20',
    'Galaxy Note 20 Ultra',
    'Galaxy Z Flip',
    'Galaxy Z Fold 2',
    'Galaxy S21',
    'Galaxy S21+',
    'Galaxy S21 Ultra',
    'Galaxy S21 FE',
    'Galaxy Z Flip 3',
    'Galaxy Z Fold 3',
    'Galaxy A32',
    'Galaxy A52',
    'Galaxy A72',
    'Galaxy S22',
    'Galaxy S22+',
    'Galaxy S22 Ultra',
    'Galaxy Z Flip 4',
    'Galaxy Z Fold 4',
    'Galaxy A33',
    'Galaxy A53',
    'Galaxy A73',
    'Galaxy S23',
    'Galaxy S23+',
    'Galaxy S23 Ultra',
    'Galaxy S23 FE',
    'Galaxy Z Flip 5',
    'Galaxy Z Fold 5',
    'Galaxy A34',
    'Galaxy A54',
    'Galaxy S24',
    'Galaxy S24+',
    'Galaxy S24 Ultra',
    'Galaxy S24 FE',
    'Galaxy Z Flip 6',
    'Galaxy Z Fold 6',
    'Galaxy A35',
    'Galaxy A55',
    'Galaxy S25',
    'Galaxy S25+',
    'Galaxy S25 Ultra',
    'Galaxy S25 Edge',
    'Galaxy Z Flip 7',
    'Galaxy Z Fold 7',
    'Galaxy A36',
    'Galaxy A56',
  ],
  xiaomi: [
    'Redmi 9',
    'Redmi 9A',
    'Redmi 9C',
    'Redmi 9T',
    'Redmi 10',
    'Redmi 10A',
    'Redmi 10C',
    'Redmi 12',
    'Redmi 12C',
    'Redmi 13',
    'Redmi 13C',
    'Redmi 14C',
    'Redmi A1',
    'Redmi A2',
    'Redmi A3',
    'Redmi Note 8',
    'Redmi Note 9',
    'Redmi Note 9S',
    'Redmi Note 9 Pro',
    'Redmi Note 10',
    'Redmi Note 10S',
    'Redmi Note 10 Pro',
    'Redmi Note 11',
    'Redmi Note 11S',
    'Redmi Note 11 Pro',
    'Redmi Note 12',
    'Redmi Note 12S',
    'Redmi Note 12 Pro',
    'Redmi Note 13',
    'Redmi Note 13 Pro',
    'Redmi Note 14',
    'Redmi Note 14 Pro',
    'Poco X3',
    'Poco X3 Pro',
    'Poco X4 Pro',
    'Poco X5',
    'Poco X5 Pro',
    'Poco X6',
    'Poco X6 Pro',
    'Poco M3',
    'Poco M4 Pro',
    'Poco M5',
    'Poco M6 Pro',
    'Poco F3',
    'Poco F4',
    'Poco F5',
    'Poco F6',
    'Poco C65',
    'Xiaomi 11 Lite',
    'Xiaomi 11T',
    'Xiaomi 12',
    'Xiaomi 12T',
    'Xiaomi 13',
    'Xiaomi 13T',
    'Xiaomi 14',
    'Xiaomi 14T',
  ],
};

export function normalizarNombreModelo(nombre: string) {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Orden cronológico de salida de cada modelo, según su posición en el
// catálogo de arriba (que ya está cargado en orden de lanzamiento). Se
// concatenan las tres marcas con catálogo en el mismo orden que
// MARCAS_DISPONIBLES — alcanza con que cada lista interna esté bien
// ordenada, no hace falta que iPhone/Samsung/Xiaomi queden intercalados
// entre sí por fecha real.
const ORDEN_MODELOS: Map<string, number> = (() => {
  const mapa = new Map<string, number>();
  let i = 0;
  for (const marca of ['iphone', 'samsung', 'xiaomi']) {
    for (const nombre of CATALOGO_MODELOS[marca]) {
      mapa.set(normalizarNombreModelo(nombre), i++);
    }
  }
  return mapa;
})();

// Compara dos nombres de carpeta por orden cronológico de salida en vez de
// alfabético — así "iPhone 7" no queda al final de la lista solo porque
// como texto "7" ordena después que "1" (iPhone 11, 12, 13...). Los nombres
// que no están en el catálogo (marcas sin catálogo, o carpetas escritas a
// mano) van al final, ordenados entre sí alfabéticamente.
export function compararModelosPorSalida(a: string, b: string): number {
  const ra = ORDEN_MODELOS.get(normalizarNombreModelo(a));
  const rb = ORDEN_MODELOS.get(normalizarNombreModelo(b));
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  return a.localeCompare(b);
}
