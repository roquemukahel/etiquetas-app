import { SupabaseClient } from '@supabase/supabase-js';

// Mapa nombre de carpeta -> imagen, para mostrar la miniatura del modelo en
// Stock, Órdenes, Plan Canje, Servicio Técnico y Compras sin repetir la
// consulta ni la lógica de "a qué carpeta pertenece este texto libre".
export async function obtenerImagenesCarpetas(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase.from('modelos_stock').select('nombre, imagen_url');
  const mapa = new Map<string, string>();
  for (const c of (data as { nombre: string; imagen_url: string | null }[]) ?? []) {
    if (c.imagen_url) mapa.set(c.nombre, c.imagen_url);
  }
  return mapa;
}

// El modelo guardado en dispositivos/canjes suele ser texto libre (a veces
// con capacidad/color agregado, ej. "iPhone 13 128GB Azul"), así que
// probamos coincidencia exacta primero y si no, "empieza con".
export function imagenParaModelo(modelo: string | null | undefined, mapa: Map<string, string>): string | null {
  if (!modelo) return null;
  if (mapa.has(modelo)) return mapa.get(modelo)!;
  for (const [nombre, url] of mapa) {
    if (modelo.startsWith(nombre)) return url;
  }
  return null;
}
