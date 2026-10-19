// ============================================================
// Ingresos de capital — la contracara de Egresos: plata que entra al negocio sin ser una venta (aporte de
// capital del dueño o de un socio, préstamo recibido, otro). Si entra en efectivo a una caja, suma al efectivo
// esperado del turno de esa caja (ver ingresos_capital_supabase.sql y app/caja).
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';
import { registrarAuditoria } from './auditoria';
import { obtenerTodasLasFilas } from './db';

export type TipoIngreso = 'aporte_capital' | 'prestamo' | 'otro';

export const ETIQUETA_TIPO_INGRESO: Record<TipoIngreso, string> = {
  aporte_capital: 'Aporte de capital',
  prestamo: 'Préstamo recibido',
  otro: 'Otro ingreso',
};

export type CajaIngreso = 'venta_diaria' | 'financiamiento';

export type Ingreso = {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  tipo: TipoIngreso;
  descripcion: string;
  importe: number;
  moneda: string;
  medio_pago: string;
  caja_tipo: CajaIngreso;
  sucursal_id: string | null;
  aportado_por: string | null;
  notas: string | null;
  anulado: boolean;
  registrado_por_nombre: string | null;
  created_at: string;
};

export type ParamsIngreso = {
  fecha: string;
  tipo: TipoIngreso;
  descripcion: string;
  importe: number;
  moneda: string;
  medioPago: string;
  cajaTipo: CajaIngreso;
  sucursalId?: string | null;
  aportadoPor?: string;
  notas?: string;
};

const COLUMNAS =
  'id, fecha, tipo, descripcion, importe, moneda, medio_pago, caja_tipo, sucursal_id, aportado_por, notas, anulado, registrado_por_nombre, created_at';

export async function obtenerIngresos(supabase: SupabaseClient, params: { desde?: string; hasta?: string } = {}): Promise<Ingreso[]> {
  return obtenerTodasLasFilas<Ingreso>(
    supabase,
    'ingresos',
    COLUMNAS,
    [
      { columna: 'fecha', ascending: false },
      { columna: 'created_at', ascending: false },
    ],
    (q) => {
      q = q.eq('anulado', false);
      if (params.desde) q = q.gte('fecha', params.desde);
      if (params.hasta) q = q.lte('fecha', params.hasta);
      return q;
    }
  );
}

function validar(params: ParamsIngreso): string | null {
  if (!params.descripcion.trim()) return 'La descripción no puede estar vacía.';
  if (!params.importe || params.importe <= 0) return 'El importe tiene que ser mayor a 0.';
  return null;
}

export async function crearIngreso(supabase: SupabaseClient, params: ParamsIngreso): Promise<{ id: string } | { error: string }> {
  const problema = validar(params);
  if (problema) return { error: problema };
  const actor = getActor();
  const { data, error } = await supabase
    .from('ingresos')
    .insert({
      fecha: params.fecha,
      tipo: params.tipo,
      descripcion: params.descripcion.trim(),
      importe: params.importe,
      moneda: params.moneda,
      medio_pago: params.medioPago,
      caja_tipo: params.cajaTipo,
      sucursal_id: params.sucursalId || null,
      aportado_por: params.aportadoPor?.trim() || null,
      notas: params.notas?.trim() || null,
      registrado_por_nombre: actor?.nombre ?? null,
      registrado_por_foto_url: actor?.fotoUrl ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  const id = (data as { id: string }).id;
  await registrarAuditoria(supabase, {
    accion: `registró un ingreso (${ETIQUETA_TIPO_INGRESO[params.tipo]}): "${params.descripcion.trim()}" por ${params.moneda}${params.importe}`,
    entidad: 'ingreso',
    entidadId: id,
    valorNuevo: { tipo: params.tipo, importe: params.importe, moneda: params.moneda, medio_pago: params.medioPago },
  });
  return { id };
}

export async function editarIngreso(supabase: SupabaseClient, ingreso: Ingreso, params: ParamsIngreso): Promise<{ ok: true } | { error: string }> {
  const problema = validar(params);
  if (problema) return { error: problema };
  const { error } = await supabase
    .from('ingresos')
    .update({
      fecha: params.fecha,
      tipo: params.tipo,
      descripcion: params.descripcion.trim(),
      importe: params.importe,
      moneda: params.moneda,
      medio_pago: params.medioPago,
      caja_tipo: params.cajaTipo,
      sucursal_id: params.sucursalId || null,
      aportado_por: params.aportadoPor?.trim() || null,
      notas: params.notas?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ingreso.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `editó un ingreso: "${ingreso.descripcion}" (${ingreso.moneda}${ingreso.importe} → ${params.moneda}${params.importe})`,
    entidad: 'ingreso',
    entidadId: ingreso.id,
    valorAnterior: { descripcion: ingreso.descripcion, importe: ingreso.importe, moneda: ingreso.moneda, tipo: ingreso.tipo },
    valorNuevo: { descripcion: params.descripcion.trim(), importe: params.importe, moneda: params.moneda, tipo: params.tipo },
  });
  return { ok: true };
}

// Anular = soft-void, nunca se borra (igual que los egresos y los pagos). Requiere motivo.
export async function anularIngreso(supabase: SupabaseClient, ingreso: Ingreso, motivo: string): Promise<{ ok: true } | { error: string }> {
  if (!motivo.trim()) return { error: 'La anulación necesita un motivo.' };
  const { error } = await supabase
    .from('ingresos')
    .update({ anulado: true, notas: [ingreso.notas, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' — '), updated_at: new Date().toISOString() })
    .eq('id', ingreso.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `anuló un ingreso: "${ingreso.descripcion}" (${ingreso.moneda}${ingreso.importe}) — ${motivo.trim()}`,
    entidad: 'ingreso',
    entidadId: ingreso.id,
    valorAnterior: { importe: ingreso.importe, tipo: ingreso.tipo },
  });
  return { ok: true };
}

// Ingresos que entraron a una caja desde que abrió el turno (para el efectivo esperado y el detalle de Caja).
// Si el negocio todavía no corrió ingresos_capital_supabase.sql la tabla no existe: se trata como "sin ingresos".
export async function obtenerIngresosDeCaja(
  supabase: SupabaseClient,
  caja: { tipo: string; sucursal_id: string | null },
  desde: string,
  hasta?: string,
  moneda?: string
): Promise<Ingreso[]> {
  let q = supabase.from('ingresos').select(COLUMNAS).eq('caja_tipo', caja.tipo).eq('anulado', false).gte('created_at', desde).order('created_at', { ascending: false });
  if (hasta) q = q.lte('created_at', hasta);
  if (moneda) q = q.eq('moneda', moneda);
  q = caja.sucursal_id ? q.eq('sucursal_id', caja.sucursal_id) : q.is('sucursal_id', null);
  const { data, error } = await q;
  if (error) return [];
  return (data as Ingreso[]) ?? [];
}

// Lo que un conjunto de ingresos aporta al efectivo físico de la caja: solo los que entraron en efectivo.
export function ingresosEnEfectivo(ingresos: Pick<Ingreso, 'medio_pago' | 'importe'>[]): number {
  return ingresos.filter((i) => i.medio_pago === 'efectivo').reduce((acc, i) => acc + (i.importe || 0), 0);
}
