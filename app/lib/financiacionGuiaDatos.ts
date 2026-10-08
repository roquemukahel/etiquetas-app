import type { SupabaseClient } from '@supabase/supabase-js';
import { enLotes } from './db';
import { soportaMigracion } from './migraciones';
import { maximoDeCarrito, resolverMaxCuotas, type MaxCuotas } from './financiacionGuia';

// Guía de financiación de cada orden: la del producto con el límite más bajo entre
// sus ítems (producto → categoría). Para mostrar la etiqueta en la pantalla de
// Financiamiento. Devuelve un mapa vacío si el negocio no activó la función.
export async function guiasDeOrdenes(supabase: SupabaseClient, ordenIds: string[]): Promise<Map<string, MaxCuotas>> {
  const salida = new Map<string, MaxCuotas>();
  const ids = Array.from(new Set(ordenIds.filter(Boolean)));
  if (ids.length === 0 || !(await soportaMigracion(supabase, 'guiaFinanciacion'))) return salida;

  const items: { orden_id: string; producto_id: string | null; dispositivo_id: string | null }[] = [];
  for (const lote of enLotes(ids)) {
    const { data, error } = await supabase.from('orden_items').select('orden_id, producto_id, dispositivo_id').in('orden_id', lote);
    if (error) return salida;
    items.push(...((data as typeof items) ?? []));
  }
  const idsProductos = Array.from(new Set(items.map((i) => i.producto_id).filter((x): x is string => !!x)));
  const idsEquipos = Array.from(new Set(items.map((i) => i.dispositivo_id).filter((x): x is string => !!x)));
  type Fila = { id: string; financiacion_max_cuotas: number | null; categoria_id: string | null };
  const productos = new Map<string, Fila>();
  const equipos = new Map<string, Fila>();
  await Promise.all([
    ...enLotes(idsProductos).map(async (lote) => {
      const { data, error } = await supabase.from('productos').select('id, financiacion_max_cuotas, categoria_id').in('id', lote);
      if (!error) for (const f of (data as Fila[]) ?? []) productos.set(f.id, f);
    }),
    ...enLotes(idsEquipos).map(async (lote) => {
      const { data, error } = await supabase.from('dispositivos').select('id, financiacion_max_cuotas, categoria_id').in('id', lote);
      if (!error) for (const f of (data as Fila[]) ?? []) equipos.set(f.id, f);
    }),
  ]);
  const { data: cats, error: errorCats } = await supabase.from('stock_categorias').select('id, financiacion_max_cuotas').limit(1000);
  if (errorCats) return salida;
  const guiaCategoria = new Map(((cats as { id: string; financiacion_max_cuotas: number | null }[]) ?? []).map((c) => [c.id, c.financiacion_max_cuotas]));

  const maximosPorOrden = new Map<string, MaxCuotas[]>();
  for (const it of items) {
    const fila = it.producto_id ? productos.get(it.producto_id) : it.dispositivo_id ? equipos.get(it.dispositivo_id) : undefined;
    if (!fila) continue;
    const lista = maximosPorOrden.get(it.orden_id) ?? [];
    lista.push(resolverMaxCuotas(fila.financiacion_max_cuotas, fila.categoria_id ? guiaCategoria.get(fila.categoria_id) : null));
    maximosPorOrden.set(it.orden_id, lista);
  }
  for (const [ordenId, maximos] of maximosPorOrden) salida.set(ordenId, maximoDeCarrito(maximos));
  return salida;
}
