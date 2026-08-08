import type { SupabaseClient } from '@supabase/supabase-js';

// "iPhone" siempre con esa capitalización exacta (i minúscula, P mayúscula,
// resto minúscula), sin importar cómo se haya tipeado — si no, "iphone 13"
// y "iPhone 13" quedan como dos carpetas distintas en vez de una sola. La
// base de datos también normaliza esto solo (ver trigger en schema.sql),
// esto es la primera línea de defensa para no ni siquiera intentar crear
// la carpeta duplicada.
export function normalizarNombreModelo(nombre: string): string {
  return nombre.replace(/\biphone\b/gi, 'iPhone');
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
