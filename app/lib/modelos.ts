import type { SupabaseClient } from '@supabase/supabase-js';
import { CATALOGO_MODELOS } from './catalogosMarcas';

// Índice de todos los modelos "de catálogo" (iPhone/Samsung/Xiaomi), armado
// una sola vez: de un nombre normalizado para comparar (minúsculas, un solo
// espacio) al nombre canónico exacto tal como está escrito en el catálogo.
const squishComparar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const CANONICO_POR_COMPARACION: Map<string, string> = new Map(
  Object.values(CATALOGO_MODELOS)
    .flat()
    .map((nombre) => [squishComparar(nombre), nombre])
);

// Si alguien escribe "iphone 13 pro", "IPHONE 13 PRO" o "iPhone 13 pro", las
// tres deben terminar siendo la MISMA carpeta — no una por cada forma de
// tipear mayúsculas/minúsculas. Para los modelos que están en el catálogo
// (ver catalogosMarcas.ts) usamos ese nombre canónico tal cual está escrito
// ahí (que ya contempla casos como "iPhone 12 mini" en minúscula o
// "iPhone XS"/"Galaxy S21 FE" con siglas en mayúscula — un simple "poner en
// mayúscula la primera letra de cada palabra" rompería esas siglas). Para
// texto libre que no matchea ningún modelo del catálogo (otra marca, o una
// carpeta genérica tipo "Televisores"), solo corregimos "iPhone" y dejamos
// el resto tal como se escribió, para no inventar mayúsculas en siglas que
// no conocemos (ej. "4K", "5G").
//
// La base de datos también normaliza "iPhone" solo (ver trigger en
// schema.sql) como red de seguridad final; esto es la primera línea de
// defensa, y además es la única capa que conoce el catálogo completo.
export function normalizarNombreModelo(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  const canonico = CANONICO_POR_COMPARACION.get(squishComparar(limpio));
  if (canonico) return canonico;
  return limpio.replace(/\biphone\b/gi, 'iPhone');
}

// Sugiere carpetas EXISTENTES parecidas a lo que se está tipeando, para
// atajar los duplicados antes de que se creen: el caso típico es que ya
// exista "iPhone 13" y el empleado escriba solo "13" (o "iphone13"), creando
// una carpeta nueva. Devuelve carpetas de las que el texto tipeado es una
// parte (comparando sin espacios ni mayúsculas), salvo que ya haya una
// coincidencia exacta (ahí no hay duplicado que avisar). No sugiere al revés
// (texto más específico que la carpeta) para no empujar a una carpeta menos
// específica cuando cargan, por ejemplo, "iPhone 13 Pro".
export function sugerirCarpetas(modelo: string, carpetas: string[]): string[] {
  const squish = (s: string) => normalizarNombreModelo(s).toLowerCase().replace(/\s+/g, '').trim();
  const t = squish(modelo);
  if (t.length < 2) return [];
  const hayExacta = carpetas.some((c) => squish(c) === t);
  if (hayExacta) return [];
  return carpetas
    .filter((c) => {
      const nc = squish(c);
      return nc !== t && nc.includes(t);
    })
    .slice(0, 4);
}

export async function asegurarModelo(supabase: SupabaseClient, nombre: string | null | undefined) {
  const limpio = nombre?.trim();
  if (!limpio) return;
  const normalizado = normalizarNombreModelo(limpio);
  // ilike sin comodines es una comparación exacta pero sin distinguir
  // mayúsculas/minúsculas — así, aunque en la base ya exista "iPhone 13"
  // guardada con otra capitalización residual, la encuentra igual y no
  // crea una carpeta repetida.
  const { data } = await supabase.from('modelos_stock').select('id').ilike('nombre', normalizado).maybeSingle();
  if (!data) {
    await supabase.from('modelos_stock').insert({ nombre: normalizado });
  }
}
