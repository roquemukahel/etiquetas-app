import type { SupabaseClient } from '@supabase/supabase-js';

// Calidades y categorías de repuestos que cada negocio puede editar (tabla
// repuestos_opciones, ver repuestos_opciones_supabase.sql). Los repuestos
// siguen guardando el nombre como texto: esto es solo la lista de opciones.
export type TipoOpcionRepuesto = 'calidad' | 'categoria';
export type OpcionRepuesto = { id: string; tipo: TipoOpcionRepuesto; nombre: string; orden: number };

// Las que existían fijas en la app antes de que fueran editables. Se usan
// mientras el negocio no tenga lista propia (o el SQL todavía no se corrió).
export const CALIDADES_PREDETERMINADAS = ['Original', 'OEM', 'Premium', 'Compatible', 'Otra'];

const normalizar = (s: string) => s.trim().toLowerCase();

// Une las opciones configuradas con los valores que algún repuesto ya tiene
// guardados, sin repetir (ignora mayúsculas y espacios de más). Así un repuesto
// con una calidad/categoría que no está en la lista (de antes, o borrada a
// mano) sigue pudiendo verse y filtrarse en vez de desaparecer.
export function combinarOpciones(configuradas: string[], enUso: (string | null | undefined)[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  const agregar = (valor: string | null | undefined) => {
    const limpio = valor?.trim();
    if (!limpio) return;
    const clave = normalizar(limpio);
    if (vistos.has(clave)) return;
    vistos.add(clave);
    resultado.push(limpio);
  };
  configuradas.forEach(agregar);
  // Los que están en uso pero no configurados van al final, ordenados.
  const extras = enUso.filter((v): v is string => !!v?.trim()).sort((a, b) => a.localeCompare(b));
  extras.forEach(agregar);
  return resultado;
}

// Valores que aparecen en los repuestos y todavía no están en la lista (una
// sola forma por cada variante de mayúsculas): son los candidatos a importar.
export function opcionesFaltantes(configuradas: string[], enUso: (string | null | undefined)[]): string[] {
  const existentes = new Set(configuradas.map(normalizar));
  const cuenta = new Map<string, Map<string, number>>();
  for (const valor of enUso) {
    const limpio = valor?.trim();
    if (!limpio) continue;
    const clave = normalizar(limpio);
    if (existentes.has(clave)) continue;
    const formas = cuenta.get(clave) ?? new Map<string, number>();
    formas.set(limpio, (formas.get(limpio) ?? 0) + 1);
    cuenta.set(clave, formas);
  }
  // De cada grupo, la forma más usada (y la alfabética si empatan).
  return Array.from(cuenta.values())
    .map((formas) => Array.from(formas.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
    .sort((a, b) => a.localeCompare(b));
}

// Cuántos repuestos usan cada opción (sin distinguir mayúsculas).
export function contarUsos(valores: (string | null | undefined)[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const v of valores) {
    const clave = v ? normalizar(v) : '';
    if (!clave) continue;
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return conteo;
}

export async function obtenerOpcionesRepuestos(
  supabase: SupabaseClient,
  tipo: TipoOpcionRepuesto
): Promise<{ opciones: OpcionRepuesto[]; disponible: boolean }> {
  const { data, error } = await supabase.from('repuestos_opciones').select('id, tipo, nombre, orden').eq('tipo', tipo).order('orden').order('nombre');
  // Si la tabla todavía no existe (falta correr el SQL) no se rompe nada:
  // quien llama usa los valores de siempre.
  if (error) return { opciones: [], disponible: false };
  return { opciones: (data as OpcionRepuesto[]) ?? [], disponible: true };
}

export async function crearOpcionRepuesto(
  supabase: SupabaseClient,
  tipo: TipoOpcionRepuesto,
  nombre: string,
  orden: number
): Promise<{ id: string } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'Escribí un nombre.' };
  const { data, error } = await supabase.from('repuestos_opciones').insert({ tipo, nombre: limpio, orden }).select('id').single();
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe una opción con ese nombre.' };
    return { error: error.message };
  }
  return { id: (data as { id: string }).id };
}

// Inserta varias de una vez ignorando las que ya existen (importar lo que los
// repuestos ya tienen escrito).
export async function importarOpcionesRepuestos(
  supabase: SupabaseClient,
  tipo: TipoOpcionRepuesto,
  nombres: string[],
  ordenInicial: number
): Promise<{ error: string | null }> {
  if (nombres.length === 0) return { error: null };
  const { error } = await supabase
    .from('repuestos_opciones')
    .insert(nombres.map((nombre, i) => ({ tipo, nombre: nombre.trim(), orden: ordenInicial + i })));
  // 23505 = ya existía alguna: no es un problema, se importó el resto en la próxima.
  if (error && error.code !== '23505') return { error: error.message };
  return { error: null };
}

// Renombra (y actualiza los repuestos que la usan). Devuelve cuántos repuestos
// cambiaron. Si el nombre nuevo ya existe, las dos se unifican.
export async function renombrarOpcionRepuesto(
  supabase: SupabaseClient,
  id: string,
  nuevoNombre: string
): Promise<{ actualizados: number } | { error: string }> {
  const { data, error } = await supabase.rpc('repuestos_opcion_renombrar', { p_id: id, p_nuevo: nuevoNombre });
  if (error) {
    if (error.message.includes('NOMBRE_VACIO')) return { error: 'Escribí un nombre.' };
    if (error.message.includes('OPCION_NO_ENCONTRADA')) return { error: 'Esa opción ya no existe. Recargá la página.' };
    return { error: error.message };
  }
  return { actualizados: Number(data) || 0 };
}

// Borra la opción; los repuestos que la tenían quedan sin especificar.
export async function borrarOpcionRepuesto(supabase: SupabaseClient, id: string): Promise<{ actualizados: number } | { error: string }> {
  const { data, error } = await supabase.rpc('repuestos_opcion_borrar', { p_id: id });
  if (error) {
    if (error.message.includes('OPCION_NO_ENCONTRADA')) return { error: 'Esa opción ya no existe. Recargá la página.' };
    return { error: error.message };
  }
  return { actualizados: Number(data) || 0 };
}
