import type { SupabaseClient } from '@supabase/supabase-js';

export async function asegurarModelo(supabase: SupabaseClient, nombre: string | null | undefined) {
  const limpio = nombre?.trim();
  if (!limpio) return;
  const { data } = await supabase.from('modelos_stock').select('id').eq('nombre', limpio).maybeSingle();
  if (!data) {
    await supabase.from('modelos_stock').insert({ nombre: limpio });
  }
}
