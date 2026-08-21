// ============================================================
// Categorías de Stock — servicio (CRUD) + tipos.
//
// Una categoría pertenece exclusivamente al negocio que la creó (RLS, ver
// categorias_stock_supabase.sql). No se borran nunca definitivamente si
// tienen productos o movimientos asociados: se archivan (soft) para
// conservar ventas/stock/historial — ver archivarCategoria().
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export type PerfilCategoria = 'dispositivo' | 'generico';
export type ModalidadStock = 'serializado' | 'cantidad';

export type Categoria = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  archivada: boolean;
  perfil_default: PerfilCategoria;
  modalidad_default: ModalidadStock;
  icono: string | null;
  color: string | null;
};

export async function obtenerCategorias(supabase: SupabaseClient, incluirArchivadas = false): Promise<Categoria[]> {
  let query = supabase.from('stock_categorias').select('id, nombre, orden, activa, archivada, perfil_default, modalidad_default, icono, color').order('orden', { ascending: true });
  if (!incluirArchivadas) query = query.eq('archivada', false);
  const { data } = await query;
  return (data as Categoria[]) ?? [];
}

// Duplicados: solo entre las categorías ACTIVAS (no archivadas) del mismo
// negocio — el índice único de la base ya lo garantiza, esto es para dar
// un mensaje de error legible ANTES de intentar el insert/update.
export async function nombreDuplicado(supabase: SupabaseClient, nombre: string, excluirId?: string): Promise<boolean> {
  const { data } = await supabase.from('stock_categorias').select('id').eq('archivada', false).ilike('nombre', nombre.trim());
  return ((data as { id: string }[]) ?? []).some((c) => c.id !== excluirId);
}

export async function crearCategoria(
  supabase: SupabaseClient,
  params: { nombre: string; perfilDefault: PerfilCategoria; modalidadDefault: ModalidadStock; orden: number }
): Promise<{ id: string } | { error: string }> {
  const nombre = params.nombre.trim();
  if (!nombre) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreDuplicado(supabase, nombre)) return { error: `Ya existe una categoría activa llamada "${nombre}".` };
  const { data, error } = await supabase
    .from('stock_categorias')
    .insert({ nombre, perfil_default: params.perfilDefault, modalidad_default: params.modalidadDefault, orden: params.orden })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function renombrarCategoria(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreDuplicado(supabase, limpio, id)) return { error: `Ya existe una categoría activa llamada "${limpio}".` };
  const { error } = await supabase.from('stock_categorias').update({ nombre: limpio, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function reordenarCategorias(supabase: SupabaseClient, ordenIds: string[]): Promise<{ ok: true } | { error: string }> {
  for (let i = 0; i < ordenIds.length; i++) {
    const { error } = await supabase.from('stock_categorias').update({ orden: i }).eq('id', ordenIds[i]);
    if (error) return { error: error.message };
  }
  return { ok: true };
}

export async function activarCategoria(supabase: SupabaseClient, id: string, activa: boolean): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('stock_categorias').update({ activa }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// Cuánto hay cargado bajo una categoría — para avisar antes de archivar
// (no bloquea archivar, solo informa; archivar SIEMPRE es seguro porque no
// borra nada, a diferencia de un intento de eliminar de verdad).
export async function contarEnCategoria(supabase: SupabaseClient, categoriaId: string): Promise<{ dispositivos: number; productos: number }> {
  const [{ count: dispositivos }, { count: productos }] = await Promise.all([
    supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('categoria_id', categoriaId),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('categoria_id', categoriaId),
  ]);
  return { dispositivos: dispositivos ?? 0, productos: productos ?? 0 };
}

export async function archivarCategoria(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  // Nunca se borra la fila ni lo que tenga cargado adentro — solo se marca
  // archivada, así deja de ofrecerse para elegir en formularios nuevos pero
  // los dispositivos/productos que ya la usan conservan absolutamente todo.
  const { error } = await supabase.from('stock_categorias').update({ archivada: true, activa: false }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function restaurarCategoria(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  if (await nombreDuplicado(supabase, nombre, id)) {
    return { error: `Ya hay una categoría activa llamada "${nombre}" — renombrá una de las dos antes de restaurar.` };
  }
  const { error } = await supabase.from('stock_categorias').update({ archivada: false, activa: true }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}
