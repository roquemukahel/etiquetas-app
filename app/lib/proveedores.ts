import type { SupabaseClient } from '@supabase/supabase-js';

// Análogo a asegurarModelo (app/lib/modelos.ts): a partir de un nombre
// tipeado a mano, busca si ya existe un proveedor con ese nombre (sin
// distinguir mayúsculas/minúsculas) y si no, lo crea. Devuelve el id para
// enlazarlo en dispositivos.proveedor_id.
export async function asegurarProveedor(supabase: SupabaseClient, nombre: string | null | undefined): Promise<string | null> {
  const limpio = nombre?.trim();
  if (!limpio) return null;
  const { data: existente } = await supabase.from('proveedores').select('id').ilike('nombre', limpio).maybeSingle();
  if (existente) return existente.id;
  const { data: nuevo } = await supabase.from('proveedores').insert({ nombre: limpio }).select('id').single();
  return nuevo?.id ?? null;
}
