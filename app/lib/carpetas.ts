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

// Para dispositivos/canjes/compras: el campo "modelo" ahí es (o debería ser)
// exactamente el nombre de una carpeta, sin texto extra — coincidencia
// exacta únicamente. Nada de "empieza con": "iPhone 14 Pro" empieza con
// "iPhone 14", y con esa lógica la carpeta corta le robaba la imagen a la
// más específica.
export function imagenPorNombreExacto(modelo: string | null | undefined, mapa: Map<string, string>): string | null {
  if (!modelo) return null;
  return mapa.get(modelo) ?? null;
}

// Para texto compuesto (ej. la descripción de un ítem de orden, que puede
// ser "iPhone 13 128GB Azul"): buscamos qué carpeta es el inicio de ese
// texto, exigiendo que corte en un límite de palabra (no a mitad de una),
// y si varias carpetas matchean nos quedamos con la más específica (nombre
// más largo) — así "iPhone 14 Pro" le gana a "iPhone 14" cuando ambas
// carpetas existen.
export function imagenParaDescripcion(descripcion: string | null | undefined, mapa: Map<string, string>): string | null {
  if (!descripcion) return null;
  let mejor: { nombre: string; url: string } | null = null;
  for (const [nombre, url] of mapa) {
    const esLimite = descripcion === nombre || descripcion.startsWith(`${nombre} `) || descripcion.startsWith(`${nombre}·`);
    if (esLimite && (!mejor || nombre.length > mejor.nombre.length)) {
      mejor = { nombre, url };
    }
  }
  return mejor?.url ?? null;
}
