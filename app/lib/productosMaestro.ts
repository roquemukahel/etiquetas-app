// ============================================================
// Catálogo maestro de productos — servicio (CRUD) + tipos.
//
// Un "maestro" es el producto lógico (nombre+marca), compartido entre
// sucursales. Cada fila de `productos` (una por sucursal) se conecta a un
// maestro vía `producto_maestro_id` — ver productos_maestro_supabase.sql.
// Mismo criterio de archivado (soft) que app/lib/categorias.ts y
// app/lib/sucursales.ts: nunca se borra un maestro que ya tiene productos
// enlazados, se archiva.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductoMaestro = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria_id: string | null;
  precio: number | null;
  costo: number | null;
  sku: string | null;
  codigo_barras: string | null;
  descripcion: string | null;
  garantia_dias: number | null;
  stock_minimo: number | null;
  proveedor_id: string | null;
  imagen_url: string | null;
  archivado: boolean;
};

const COLUMNAS =
  'id, nombre, marca, categoria_id, precio, costo, sku, codigo_barras, descripcion, garantia_dias, stock_minimo, proveedor_id, imagen_url, archivado';

export async function obtenerProductosMaestro(supabase: SupabaseClient, incluirArchivados = false): Promise<ProductoMaestro[]> {
  let query = supabase.from('productos_maestro').select(COLUMNAS).order('nombre', { ascending: true });
  if (!incluirArchivados) query = query.eq('archivado', false);
  const { data } = await query;
  return (data as ProductoMaestro[]) ?? [];
}

// Igual que nombreDuplicado (categorias.ts): comparación case-insensitive
// para dar un mensaje legible antes del insert — el índice único de la base
// es la garantía real.
export async function productoMaestroDuplicado(supabase: SupabaseClient, nombre: string, marca: string | null, excluirId?: string): Promise<boolean> {
  let query = supabase.from('productos_maestro').select('id').eq('archivado', false).ilike('nombre', nombre.trim());
  query = marca && marca.trim() ? query.ilike('marca', marca.trim()) : query.is('marca', null);
  const { data } = await query;
  return ((data as { id: string }[]) ?? []).some((p) => p.id !== excluirId);
}

export async function crearProductoMaestro(
  supabase: SupabaseClient,
  params: {
    nombre: string;
    marca?: string | null;
    categoriaId?: string | null;
    precio?: number | null;
    costo?: number | null;
    sku?: string | null;
    codigoBarras?: string | null;
    descripcion?: string | null;
    garantiaDias?: number | null;
    stockMinimo?: number | null;
    proveedorId?: string | null;
    imagenUrl?: string | null;
  }
): Promise<{ id: string } | { error: string }> {
  const nombre = params.nombre.trim();
  if (!nombre) return { error: 'El nombre no puede estar vacío.' };
  const marca = params.marca?.trim() || null;
  if (await productoMaestroDuplicado(supabase, nombre, marca)) {
    return { error: `Ya existe "${nombre}"${marca ? ` (${marca})` : ''} en el catálogo — buscalo y elegilo en vez de crear uno nuevo.` };
  }
  const { data, error } = await supabase
    .from('productos_maestro')
    .insert({
      nombre,
      marca,
      categoria_id: params.categoriaId || null,
      precio: params.precio ?? null,
      costo: params.costo ?? null,
      sku: params.sku?.trim() || null,
      codigo_barras: params.codigoBarras?.trim() || null,
      descripcion: params.descripcion?.trim() || null,
      garantia_dias: params.garantiaDias ?? null,
      stock_minimo: params.stockMinimo ?? null,
      proveedor_id: params.proveedorId || null,
      imagen_url: params.imagenUrl || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function actualizarProductoMaestro(
  supabase: SupabaseClient,
  id: string,
  params: {
    nombre: string;
    marca?: string | null;
    categoriaId?: string | null;
    precio?: number | null;
    costo?: number | null;
    sku?: string | null;
    codigoBarras?: string | null;
    garantiaDias?: number | null;
    stockMinimo?: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  const nombre = params.nombre.trim();
  if (!nombre) return { error: 'El nombre no puede estar vacío.' };
  const marca = params.marca?.trim() || null;
  if (await productoMaestroDuplicado(supabase, nombre, marca, id)) {
    return { error: `Ya existe "${nombre}"${marca ? ` (${marca})` : ''} en el catálogo.` };
  }
  const { error } = await supabase
    .from('productos_maestro')
    .update({
      nombre,
      marca,
      categoria_id: params.categoriaId || null,
      precio: params.precio ?? null,
      costo: params.costo ?? null,
      sku: params.sku?.trim() || null,
      codigo_barras: params.codigoBarras?.trim() || null,
      garantia_dias: params.garantiaDias ?? null,
      stock_minimo: params.stockMinimo ?? null,
    })
    .eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// Cuánto stock hay cargado bajo un maestro — para avisar antes de archivar.
export async function contarEnProductoMaestro(supabase: SupabaseClient, maestroId: string): Promise<number> {
  const { count } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq('producto_maestro_id', maestroId);
  return count ?? 0;
}

export async function archivarProductoMaestro(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('productos_maestro').update({ archivado: true }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}
