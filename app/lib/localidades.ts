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

// ---- Unificar localidades escritas de distintas formas ("las cejas" / "Las Cejas", "Estacion araoz" / "ESTACION ARAOZ") ----
const PALABRAS_CHICAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
const limpiarLocalidad = (s: string) => s.trim().replace(/\s+/g, ' ');

// "las cejas" → "Las Cejas", "SAN MIGUEL DE TUCUMAN" → "San Miguel de Tucuman".
export function aTituloLocalidad(s: string): string {
  return limpiarLocalidad(s)
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && PALABRAS_CHICAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export type PlanUnificacion = {
  grupos: {
    destino: string;
    // Escrituras de los clientes que hay que cambiar por el destino (valor tal cual está guardado → cantidad de clientes).
    clientes: { desde: string; cantidad: number }[];
    // Entradas de la lista de localidades: se quitan las repetidas y, si ninguna está bien escrita, se renombra una.
    listaQuitar: Localidad[];
    listaRenombrar: Localidad | null;
  }[];
};

// Detecta las localidades que se repiten escritas distinto (mismo texto sin mayúsculas/acentos/espacios) y decide cuál queda: la de la
// lista si ya está bien escrita; si no, la mejor escrita entre las de los clientes (con mayúscula inicial y, de preferencia, con acentos).
export function planUnificacionLocalidades(lista: Localidad[], valoresClientes: (string | null | undefined)[]): PlanUnificacion {
  const crudos = new Map<string, number>(); // valor guardado tal cual → clientes
  for (const v of valoresClientes) {
    if (v == null || !v.trim()) continue;
    crudos.set(v, (crudos.get(v) ?? 0) + 1);
  }
  type G = { clientes: { desde: string; cantidad: number }[]; lista: Localidad[] };
  const grupos = new Map<string, G>();
  const de = (k: string) => grupos.get(k) ?? grupos.set(k, { clientes: [], lista: [] }).get(k)!;
  for (const [desde, cantidad] of crudos) de(claveLocalidad(desde)).clientes.push({ desde, cantidad });
  for (const l of lista) de(claveLocalidad(l.nombre)).lista.push(l);

  const puntaje = (texto: string, frecuencia: number) =>
    (texto === aTituloLocalidad(texto) ? 10 : 0) + (texto !== claveLocalidad(texto) && /[̀-ͯ]/.test(texto.normalize('NFD')) ? 3 : 0) + Math.min(frecuencia, 999) / 1000;

  const plan: PlanUnificacion = { grupos: [] };
  for (const g of grupos.values()) {
    const escrituras = new Set([...g.clientes.map((c) => limpiarLocalidad(c.desde)), ...g.lista.map((l) => limpiarLocalidad(l.nombre))]);
    const hayCrudosSucios = g.clientes.some((c) => c.desde !== limpiarLocalidad(c.desde));
    if (escrituras.size < 2 && g.lista.length < 2 && !hayCrudosSucios) continue; // una sola forma de escribirla
    // Candidatos: primero lo que ya está en la lista, después lo que escribieron los clientes.
    const candidatos = [
      ...g.lista.map((l) => ({ texto: limpiarLocalidad(l.nombre), puntaje: puntaje(limpiarLocalidad(l.nombre), 0) + 5 })),
      ...g.clientes.map((c) => ({ texto: limpiarLocalidad(c.desde), puntaje: puntaje(limpiarLocalidad(c.desde), c.cantidad) })),
    ].sort((a, b) => b.puntaje - a.puntaje);
    const mejor = candidatos[0];
    const destino = mejor.puntaje >= 10 ? mejor.texto : aTituloLocalidad(mejor.texto);

    const cambiar = g.clientes.filter((c) => c.desde !== destino);
    const exacta = g.lista.find((l) => l.nombre === destino);
    const listaQuitar = exacta ? g.lista.filter((l) => l !== exacta) : g.lista.slice(1);
    const listaRenombrar = !exacta && g.lista.length > 0 ? g.lista[0] : null;
    if (cambiar.length === 0 && listaQuitar.length === 0 && !listaRenombrar) continue;
    plan.grupos.push({ destino, clientes: cambiar, listaQuitar, listaRenombrar });
  }
  return plan;
}
