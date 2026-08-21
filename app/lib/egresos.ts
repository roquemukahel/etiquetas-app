// ============================================================
// Egresos operativos — servicio (CRUD) + tipos.
//
// Alcance a propósito ACOTADO (ver egresos_supabase.sql): gasto operativo,
// retiro de dinero, ajuste u otro egreso — NUNCA compra de mercadería ni
// pago a proveedor, esos ya se registran en sus propias tablas
// (compras_proveedor/compras manuales y proveedor_movimientos). Mezclarlos
// acá duplicaría la misma plata dos veces.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';
import { registrarAuditoria } from './auditoria';

export type TipoEgreso = 'gasto_operativo' | 'retiro' | 'ajuste' | 'otro';

export const ETIQUETA_TIPO_EGRESO: Record<TipoEgreso, string> = {
  gasto_operativo: 'Gasto operativo',
  retiro: 'Retiro de dinero',
  ajuste: 'Ajuste',
  otro: 'Otro egreso',
};

export type CategoriaEgreso = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  archivada: boolean;
};

export type Egreso = {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  categoria_id: string | null;
  tipo: TipoEgreso;
  descripcion: string;
  importe: number;
  moneda: string;
  medio_pago: string | null;
  proveedor_id: string | null;
  notas: string | null;
  anulado: boolean;
  registrado_por_nombre: string | null;
  registrado_por_foto_url: string | null;
  created_at: string;
};

// ---------- Categorías ----------
export async function obtenerCategoriasEgresos(supabase: SupabaseClient, incluirArchivadas = false): Promise<CategoriaEgreso[]> {
  let query = supabase.from('egresos_categorias').select('id, nombre, orden, activa, archivada').order('orden', { ascending: true });
  if (!incluirArchivadas) query = query.eq('archivada', false);
  const { data } = await query;
  return (data as CategoriaEgreso[]) ?? [];
}

async function nombreCategoriaDuplicado(supabase: SupabaseClient, nombre: string, excluirId?: string): Promise<boolean> {
  const { data } = await supabase.from('egresos_categorias').select('id').eq('archivada', false).ilike('nombre', nombre.trim());
  return ((data as { id: string }[]) ?? []).some((c) => c.id !== excluirId);
}

export async function crearCategoriaEgreso(supabase: SupabaseClient, nombre: string, orden: number): Promise<{ id: string } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreCategoriaDuplicado(supabase, limpio)) return { error: `Ya existe una categoría activa llamada "${limpio}".` };
  const { data, error } = await supabase.from('egresos_categorias').insert({ nombre: limpio, orden }).select('id').single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function renombrarCategoriaEgreso(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede estar vacío.' };
  if (await nombreCategoriaDuplicado(supabase, limpio, id)) return { error: `Ya existe una categoría activa llamada "${limpio}".` };
  const { error } = await supabase.from('egresos_categorias').update({ nombre: limpio, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function reordenarCategoriasEgresos(supabase: SupabaseClient, ordenIds: string[]): Promise<{ ok: true } | { error: string }> {
  for (let i = 0; i < ordenIds.length; i++) {
    const { error } = await supabase.from('egresos_categorias').update({ orden: i }).eq('id', ordenIds[i]);
    if (error) return { error: error.message };
  }
  return { ok: true };
}

export async function activarCategoriaEgreso(supabase: SupabaseClient, id: string, activa: boolean): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('egresos_categorias').update({ activa }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// Cuántos egresos hay cargados bajo una categoría — para avisar antes de
// archivar (no bloquea, solo informa; archivar nunca borra nada).
export async function contarEnCategoriaEgreso(supabase: SupabaseClient, categoriaId: string): Promise<number> {
  const { count } = await supabase.from('egresos').select('id', { count: 'exact', head: true }).eq('categoria_id', categoriaId).eq('anulado', false);
  return count ?? 0;
}

export async function archivarCategoriaEgreso(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('egresos_categorias').update({ archivada: true, activa: false }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function restaurarCategoriaEgreso(supabase: SupabaseClient, id: string, nombre: string): Promise<{ ok: true } | { error: string }> {
  if (await nombreCategoriaDuplicado(supabase, nombre, id)) {
    return { error: `Ya hay una categoría activa llamada "${nombre}" — renombrá una de las dos antes de restaurar.` };
  }
  const { error } = await supabase.from('egresos_categorias').update({ archivada: false, activa: true }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// ---------- Egresos ----------
export async function obtenerEgresos(
  supabase: SupabaseClient,
  params: { desde?: string; hasta?: string } = {}
): Promise<Egreso[]> {
  let query = supabase
    .from('egresos')
    .select('id, fecha, categoria_id, tipo, descripcion, importe, moneda, medio_pago, proveedor_id, notas, anulado, registrado_por_nombre, registrado_por_foto_url, created_at')
    .eq('anulado', false)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (params.desde) query = query.gte('fecha', params.desde);
  if (params.hasta) query = query.lte('fecha', params.hasta);
  const { data } = await query;
  return (data as Egreso[]) ?? [];
}

export async function crearEgreso(
  supabase: SupabaseClient,
  params: {
    fecha: string;
    categoriaId: string | null;
    tipo: TipoEgreso;
    descripcion: string;
    importe: number;
    moneda: string;
    medioPago: string | null;
    proveedorId: string | null;
    notas?: string;
  }
): Promise<{ id: string } | { error: string }> {
  const descripcion = params.descripcion.trim();
  if (!descripcion) return { error: 'La descripción no puede estar vacía.' };
  if (!params.importe || params.importe <= 0) return { error: 'El importe tiene que ser mayor a 0.' };

  const actor = getActor();
  const { data, error } = await supabase
    .from('egresos')
    .insert({
      fecha: params.fecha,
      categoria_id: params.categoriaId,
      tipo: params.tipo,
      descripcion,
      importe: params.importe,
      moneda: params.moneda,
      medio_pago: params.medioPago,
      proveedor_id: params.proveedorId,
      notas: params.notas?.trim() || null,
      registrado_por_nombre: actor?.nombre ?? null,
      registrado_por_foto_url: actor?.fotoUrl ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `registró un egreso (${ETIQUETA_TIPO_EGRESO[params.tipo]}): "${descripcion}" por ${params.moneda}${params.importe}`,
    entidad: 'egreso',
    entidadId: (data as { id: string }).id,
    valorNuevo: { tipo: params.tipo, importe: params.importe, moneda: params.moneda },
  });

  return { id: (data as { id: string }).id };
}

// Anular = soft-void, nunca se borra (mismo patrón que cta_cte_movimientos/
// proveedor_movimientos). Requiere motivo, igual que ajustar/anular en
// financiación.
export async function anularEgreso(supabase: SupabaseClient, egreso: Egreso, motivo: string): Promise<{ ok: true } | { error: string }> {
  if (!motivo.trim()) return { error: 'La anulación necesita un motivo.' };
  const { error } = await supabase
    .from('egresos')
    .update({ anulado: true, notas: [egreso.notas, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' — '), updated_at: new Date().toISOString() })
    .eq('id', egreso.id);
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `anuló un egreso: "${egreso.descripcion}" (${egreso.moneda}${egreso.importe}) — ${motivo.trim()}`,
    entidad: 'egreso',
    entidadId: egreso.id,
    valorAnterior: { importe: egreso.importe, tipo: egreso.tipo },
  });
  return { ok: true };
}
