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
