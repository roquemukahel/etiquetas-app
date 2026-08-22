// ============================================================
// Sucursales — servicio (CRUD) + tipos.
//
// Una sucursal pertenece exclusivamente al negocio que la creó (RLS, ver
// sucursales_supabase.sql). No se borran nunca definitivamente si tienen
// datos asociados: se archivan (soft) para conservar stock/ventas/personal
// — ver archivarSucursal(). Mismo criterio que app/lib/categorias.ts.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export type Sucursal = {
  id: string;
  nombre: string;
  activa: boolean;
  archivada: boolean;
};

export async function obtenerSucursales(supabase: SupabaseClient, incluirArchivadas = false): Promise<Sucursal[]> {
  let query = supabase.from('sucursales').select('id, nombre, activa, archivada').order('created_at', { ascending: true });
  if (!incluirArchivadas) query = query.eq('archivada', false);
  const { data } = await query;
  return (data as Sucursal[]) ?? [];
}

// Duplicados: solo entre las ACTIVAS (no archivadas) del mismo negocio — el
// índice único de la base ya lo garantiza, esto es para dar un mensaje de
// error legible antes de intentar el insert/update.
export async function nombreSucursalDuplicado(supabase: SupabaseClient, nombre: string, excluirId?: string): Promise<boolean> {
  const { data } = await supabase.from('sucursales').select('id').eq('archivada', false).ilike('nombre', nombre.trim());
  return ((data as { id: string }[]) ?? []).some((s) => s.id !== excluirId);
}

export async function crearSucursal(supabase: SupabaseClient, nombre: string): Promise<{ id: string } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreSucursalDuplicado(supabase, limpio)) return { error: `Ya existe una sucursal activa llamada "${limpio}".` };
  const { data, error } = await supabase.from('sucursales').insert({ nombre: limpio }).select('id').single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function renombrarSucursal(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreSucursalDuplicado(supabase, limpio, id)) return { error: `Ya existe una sucursal activa llamada "${limpio}".` };
  const { error } = await supabase.from('sucursales').update({ nombre: limpio }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function activarSucursal(supabase: SupabaseClient, id: string, activa: boolean): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('sucursales').update({ activa }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// Cuánto hay cargado bajo una sucursal — para avisar antes de archivar (no
// bloquea, solo informa; archivar SIEMPRE es seguro porque no borra nada).
export async function contarEnSucursal(supabase: SupabaseClient, sucursalId: string): Promise<{ dispositivos: number; productos: number; personal: number }> {
  const [{ count: dispositivos }, { count: productos }, { count: vendedores }, { count: tecnicos }] = await Promise.all([
    supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursalId),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursalId),
    supabase.from('vendedores').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursalId),
    supabase.from('tecnicos').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursalId),
  ]);
  return { dispositivos: dispositivos ?? 0, productos: productos ?? 0, personal: (vendedores ?? 0) + (tecnicos ?? 0) };
}

export async function archivarSucursal(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  // Nunca se borra la fila ni lo que tenga cargado adentro — solo se marca
  // archivada, así deja de ofrecerse para elegir pero el stock/personal que
  // ya la usa conserva absolutamente todo.
  const { error } = await supabase.from('sucursales').update({ archivada: true, activa: false }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function restaurarSucursal(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  if (await nombreSucursalDuplicado(supabase, nombre, id)) {
    return { error: `Ya hay una sucursal activa llamada "${nombre}" — renombrá una de las dos antes de restaurar.` };
  }
  const { error } = await supabase.from('sucursales').update({ archivada: false, activa: true }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}
