import type { SupabaseClient } from '@supabase/supabase-js';

// Análogo a asegurarModelo (app/lib/modelos.ts): a partir de un nombre
// tipeado a mano, busca si ya existe un proveedor con ese nombre (sin
// distinguir mayúsculas/minúsculas) y si no, lo crea. Devuelve el id para
// enlazarlo en dispositivos.proveedor_id.
//
// BUG REAL corregido acá (2026-08-29): antes usaba .maybeSingle(), que
// TIRA UN ERROR si la búsqueda encuentra más de una fila — como el error
// nunca se chequeaba, en cuanto un proveedor quedaba duplicado por
// cualquier motivo (ej. dos altas casi simultáneas), esta función dejaba
// de poder encontrarlo NUNCA MÁS: cada carga siguiente volvía a crear otro
// duplicado más, en una bola de nieve sin fin (así es como un proveedor
// terminó apareciendo repetido decenas de veces). .limit(1) nunca tira ese
// error pase lo que pase en la tabla, y ordenar por created_at hace que
// siempre se reuse el más viejo (el "original") como referencia estable.
export async function asegurarProveedor(supabase: SupabaseClient, nombre: string | null | undefined): Promise<string | null> {
  const limpio = nombre?.trim();
  if (!limpio) return null;
  const { data: existentes } = await supabase
    .from('proveedores')
    .select('id')
    .ilike('nombre', limpio)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existentes && existentes.length > 0) return existentes[0].id;
  const { data: nuevo } = await supabase.from('proveedores').insert({ nombre: limpio }).select('id').single();
  return nuevo?.id ?? null;
}
