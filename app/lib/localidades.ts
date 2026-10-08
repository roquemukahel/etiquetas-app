import type { SupabaseClient } from '@supabase/supabase-js';

// Lista cerrada de localidades/zonas por negocio, para que "Rosario", "rosario"
// y "ROSARIO " no sean tres zonas distintas al armar recorridos de cobranza.
// El cliente guarda el NOMBRE en clientes.localidad (columna que ya existía);
// la lista vive en la tabla `localidades` (financiacion_guia_cartera_supabase.sql).
// Mientras el negocio no corrió esa migración, devuelve null y la pantalla
// sigue con el campo de texto libre de siempre.
export type Localidad = { id: string; nombre: string };

export async function obtenerLocalidades(supabase: SupabaseClient): Promise<Localidad[] | null> {
  const { data, error } = await supabase.from('localidades').select('id, nombre').order('nombre', { ascending: true }).limit(2000);
  if (error) return null;
  return (data as Localidad[]) ?? [];
}

// Mismo texto sin importar mayúsculas, acentos ni espacios de más.
export const claveLocalidad = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// Crea la localidad si no existe (sin distinguir mayúsculas/acentos); si ya
// existe devuelve la existente — nunca queda una duplicada escrita distinto.
export async function crearLocalidad(supabase: SupabaseClient, nombre: string): Promise<Localidad | { error: string }> {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (!limpio) return { error: 'Escribí el nombre de la localidad.' };
  const actuales = await obtenerLocalidades(supabase);
  if (actuales === null) return { error: 'La lista de localidades todavía no está activada en la base de datos.' };
  const existente = actuales.find((l) => claveLocalidad(l.nombre) === claveLocalidad(limpio));
  if (existente) return existente;
  const { data, error } = await supabase.from('localidades').insert({ nombre: limpio }).select('id, nombre').single();
  if (error) return { error: error.message };
  return data as Localidad;
}

// ---- Filtro por localidad (Clientes, Cuentas por cobrar, Mora) ----
export const SIN_LOCALIDAD = '__sin_localidad__';

// Localidades distintas que aparecen en una lista de valores (sin repetir por
// mayúsculas/acentos), ordenadas — para llenar el desplegable del filtro.
export function opcionesLocalidad(valores: (string | null | undefined)[]): string[] {
  const mapa = new Map<string, string>();
  for (const v of valores) {
    const n = (v ?? '').trim().replace(/\s+/g, ' ');
    if (!n) continue;
    const k = claveLocalidad(n);
    if (!mapa.has(k)) mapa.set(k, n);
  }
  return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b));
}

export function coincideLocalidad(valor: string | null | undefined, filtro: string): boolean {
  if (!filtro) return true;
  const v = (valor ?? '').trim();
  if (filtro === SIN_LOCALIDAD) return v === '';
  return claveLocalidad(v) === claveLocalidad(filtro);
}
