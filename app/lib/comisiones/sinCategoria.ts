import type { SupabaseClient } from '@supabase/supabase-js';

// Productos del catálogo que no tienen categoría: una regla "por categoría" no los alcanza (les toca la del tipo de ítem o la general).
// Cuenta los productos del catálogo (un producto cargado en varias sucursales cuenta una vez) y los sueltos que no pertenecen a uno.
export type ProductoSinCategoria = { nombre: string; marca: string | null };

export async function productosSinCategoria(supabase: SupabaseClient): Promise<{ total: number; ejemplos: ProductoSinCategoria[] }> {
  const ejemplos: ProductoSinCategoria[] = [];
  let total = 0;

  const maestros = await supabase.from('productos_maestro').select('nombre, marca', { count: 'exact' }).is('categoria_id', null).order('nombre').limit(40);
  const hayMaestros = !maestros.error;
  if (hayMaestros) {
    total += maestros.count ?? 0;
    for (const m of (maestros.data ?? []) as { nombre: string; marca: string | null }[]) ejemplos.push({ nombre: m.nombre, marca: m.marca ?? null });
  }

  // Los que no están vinculados a un producto del catálogo. Sin el catálogo (negocio viejo) son todos los productos sin categoría.
  let sueltos = supabase.from('productos').select('nombre, marca', { count: 'exact' }).is('categoria_id', null).order('nombre').limit(40);
  if (hayMaestros) sueltos = sueltos.is('producto_maestro_id', null);
  const rs = await sueltos;
  if (!rs.error) {
    total += rs.count ?? 0;
    for (const p of (rs.data ?? []) as { nombre: string; marca: string | null }[]) ejemplos.push({ nombre: p.nombre, marca: p.marca ?? null });
  }
  return { total, ejemplos: ejemplos.slice(0, 40) };
}
