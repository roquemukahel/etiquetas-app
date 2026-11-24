// ============================================================
// Categorías de Stock — servicio (CRUD) + tipos.
//
// Una categoría pertenece exclusivamente al negocio que la creó (RLS, ver
// categorias_stock_supabase.sql). No se borran nunca definitivamente si
// tienen productos o movimientos asociados: se archivan (soft) para
// conservar ventas/stock/historial — ver archivarCategoria().
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { tr } from './tr';

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
  // Subcategorías (subcategorias_supabase.sql): la categoría de la que cuelga. Ausente/null = categoría de primer nivel.
  padre_id?: string | null;
};

const COLUMNAS_CATEGORIA = 'id, nombre, orden, activa, archivada, perfil_default, modalidad_default, icono, color';

export async function obtenerCategorias(supabase: SupabaseClient, incluirArchivadas = false): Promise<Categoria[]> {
  const consultar = (columnas: string) => {
    const query = supabase.from('stock_categorias').select(columnas).order('orden', { ascending: true });
    return incluirArchivadas ? query : query.eq('archivada', false);
  };
  // Con padre_id si el negocio ya corrió subcategorias_supabase.sql; si no, sin esa columna (todas quedan de primer nivel).
  let { data, error } = await consultar(COLUMNAS_CATEGORIA + ', padre_id');
  if (error) ({ data } = await consultar(COLUMNAS_CATEGORIA));
  return (data as unknown as Categoria[]) ?? [];
}

// Duplicados: solo entre las categorías ACTIVAS (no archivadas) del mismo
// negocio — el índice único de la base ya lo garantiza, esto es para dar
// un mensaje de error legible ANTES de intentar el insert/update.
// El nombre es único dentro del mismo padre (dos categorías distintas pueden tener cada una su subcategoría "Otros"). Si no se
// indica el padre y se está renombrando, es el de la propia categoría.
export async function nombreDuplicado(supabase: SupabaseClient, nombre: string, excluirId?: string, padreId?: string | null): Promise<boolean> {
  let padre: string | null = padreId ?? null;
  if (padreId === undefined && excluirId) {
    const { data: propia, error: errorPropia } = await supabase.from('stock_categorias').select('padre_id').eq('id', excluirId).maybeSingle();
    if (!errorPropia) padre = (propia as { padre_id: string | null } | null)?.padre_id ?? null;
  }
  const { data, error } = await supabase.from('stock_categorias').select('id, padre_id').eq('archivada', false).ilike('nombre', nombre.trim());
  if (error) {
    // Sin la columna padre_id (SQL de subcategorías sin correr): se compara solo por nombre, como siempre.
    const { data: planas, error: errorPlanas } = await supabase.from('stock_categorias').select('id').eq('archivada', false).ilike('nombre', nombre.trim());
    if (errorPlanas) return false; // si ni así se puede leer, el índice único de la base frena el duplicado
    return ((planas as { id: string }[]) ?? []).some((c) => c.id !== excluirId);
  }
  return ((data as { id: string; padre_id: string | null }[]) ?? []).some((c) => c.id !== excluirId && (c.padre_id ?? null) === padre);
}

export async function crearCategoria(
  supabase: SupabaseClient,
  params: { nombre: string; perfilDefault: PerfilCategoria; modalidadDefault: ModalidadStock; orden: number; padreId?: string | null }
): Promise<{ id: string } | { error: string }> {
  const nombre = params.nombre.trim();
  if (!nombre) return { error: tr('El nombre no puede estar vacío.') };
  if (await nombreDuplicado(supabase, nombre, undefined, params.padreId ?? null)) {
    return { error: params.padreId ? `${tr('Ya existe una subcategoría activa llamada')} "${nombre}" ${tr('en esa categoría.')}` : `${tr('Ya existe una categoría activa llamada')} "${nombre}".` };
  }
  const { data, error } = await supabase
    .from('stock_categorias')
    .insert({
      nombre,
      perfil_default: params.perfilDefault,
      modalidad_default: params.modalidadDefault,
      orden: params.orden,
      ...(params.padreId ? { padre_id: params.padreId } : {}),
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function renombrarCategoria(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: tr('El nombre no puede estar vacío.') };
  if (await nombreDuplicado(supabase, limpio, id)) return { error: `${tr('Ya existe una categoría activa llamada')} "${limpio}".` };
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
  // Incluye lo que está en sus subcategorías (si las tiene).
  const { data: hijas, error: errorHijas } = await supabase.from('stock_categorias').select('id').eq('padre_id', categoriaId);
  const ids = [categoriaId, ...(errorHijas ? [] : ((hijas as { id: string }[] | null) ?? []).map((h) => h.id))];
  // Una consulta por categoría (la lista es chica): sin armar un .in() que pueda crecer.
  const conteos = await Promise.all(
    ids.map((id) =>
      Promise.all([
        supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('categoria_id', id),
      ])
    )
  );
  const dispositivos = conteos.reduce((a, [d]) => a + (d.count ?? 0), 0);
  const productos = conteos.reduce((a, [, p]) => a + (p.count ?? 0), 0);
  return { dispositivos: dispositivos ?? 0, productos: productos ?? 0 };
}

export async function archivarCategoria(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  // Nunca se borra la fila ni lo que tenga cargado adentro — solo se marca
  // archivada, así deja de ofrecerse para elegir en formularios nuevos pero
  // los dispositivos/productos que ya la usan conservan absolutamente todo.
  const { error } = await supabase.from('stock_categorias').update({ archivada: true, activa: false }).eq('id', id);
  if (error) return { error: error.message };
  // Archivar una categoría archiva también sus subcategorías (sin la columna padre_id no hay subcategorías y no hay nada que hacer).
  const { error: errorHijas } = await supabase.from('stock_categorias').update({ archivada: true, activa: false }).eq('padre_id', id);
  if (errorHijas && !/padre_id/.test(errorHijas.message)) return { error: errorHijas.message };
  return { ok: true };
}

export async function restaurarCategoria(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  if (await nombreDuplicado(supabase, nombre, id)) {
    return { error: `${tr('Ya hay una categoría activa llamada')} "${nombre}" — ${tr('renombrá una de las dos antes de restaurar.')}` };
  }
  const { error } = await supabase.from('stock_categorias').update({ archivada: false, activa: true }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}
