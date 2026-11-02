import { compararModelosPorSalida } from './catalogosMarcas';

// Stock público en JSON (/stock-publico/<token>/json) para que otra app lo lea en vivo.
// Solo lo que se publica: modelo, capacidad, color, estado, batería, cantidad y precio. NUNCA costo, IMEI, número de
// serie, proveedor ni nada de clientes: las columnas que se piden a la base son estas y ninguna otra.
export const COLUMNAS_STOCK_PUBLICO_JSON = 'modelo, capacidad_gb, color, estado, salud_bateria, precio';

export type FilaStockPublico = {
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  estado: string | null;
  salud_bateria: number | null;
  precio: number | string | null;
};

export type ItemStockPublicoJson = {
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  estado: string | null;
  bateria: number | null;
  cantidad: number;
  precio_mayorista: number | null;
};

export type StockPublicoJson = {
  negocio: string;
  moneda: string;
  actualizado: string;
  total_equipos: number;
  items: ItemStockPublicoJson[];
};

// El enlace lo puede leer cualquier app de otro dominio (el navegador exige CORS para eso).
export const CABECERAS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const aNumero = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Junta los equipos iguales en una sola línea con su cantidad. "Iguales" = mismo modelo, capacidad, color, estado,
// batería y precio: así cada línea tiene UNA batería y UN precio exactos (no un promedio ni un rango).
export function agruparStockPublico(filas: FilaStockPublico[]): ItemStockPublicoJson[] {
  const grupos = new Map<string, ItemStockPublicoJson>();
  for (const f of filas) {
    const item: ItemStockPublicoJson = {
      modelo: f.modelo,
      capacidad_gb: f.capacidad_gb,
      color: f.color,
      estado: f.estado,
      bateria: aNumero(f.salud_bateria),
      cantidad: 1,
      precio_mayorista: aNumero(f.precio),
    };
    const clave = JSON.stringify([item.modelo, item.capacidad_gb, item.color, item.estado, item.bateria, item.precio_mayorista]);
    const existente = grupos.get(clave);
    if (existente) existente.cantidad += 1;
    else grupos.set(clave, item);
  }
  return Array.from(grupos.values()).sort(
    (a, b) =>
      compararModelosPorSalida(a.modelo ?? '', b.modelo ?? '') ||
      (a.capacidad_gb ?? 0) - (b.capacidad_gb ?? 0) ||
      (a.color ?? '').localeCompare(b.color ?? '') ||
      (a.estado ?? '').localeCompare(b.estado ?? '') ||
      (b.bateria ?? -1) - (a.bateria ?? -1) ||
      (a.precio_mayorista ?? 0) - (b.precio_mayorista ?? 0)
  );
}

export function armarStockPublicoJson(negocio: { nombre: string; moneda: string | null }, filas: FilaStockPublico[], ahora: Date = new Date()): StockPublicoJson {
  return {
    negocio: negocio.nombre,
    moneda: negocio.moneda || 'ARS',
    actualizado: ahora.toISOString(),
    total_equipos: filas.length,
    items: agruparStockPublico(filas),
  };
}

// Una dirección de stock público: /stock-publico/<token>, con el token en formato UUID.
export const FORMATO_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
