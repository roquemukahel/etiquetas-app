// ============================================================
// Fondos disponibles — saldo manual de la empresa en 3 categorías
// (efectivo en pesos, transferencias en pesos, dólares en efectivo),
// INDEPENDIENTE de la apertura/cierre de turno de Caja (ver app/caja):
// no es una caja que se abre y cierra por día, es el dinero disponible
// de la empresa en todo momento. Solo administradores lo ven y lo
// mueven (permiso 'gestionar_fondos', ver permisos.ts).
//
// Mismo criterio que cuenta corriente/proveedores en toda la app: el
// saldo NUNCA se guarda, siempre se calcula sumando los movimientos
// (ver saldosPorCategoria). Requiere fondos_manuales_supabase.sql.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';
import { registrarAuditoria } from './auditoria';
import { obtenerTodasLasFilas } from './db';

export type CategoriaFondo = 'efectivo_ars' | 'transferencia_ars' | 'efectivo_usd';
export const CATEGORIAS_FONDO: CategoriaFondo[] = ['efectivo_ars', 'transferencia_ars', 'efectivo_usd'];

export const ETIQUETA_CATEGORIA_FONDO: Record<CategoriaFondo, string> = {
  efectivo_ars: 'Efectivo en pesos',
  transferencia_ars: 'Transferencias en pesos',
  efectivo_usd: 'Dólares en efectivo',
};

// Cada categoría implica una sola moneda/símbolo — no se guarda moneda aparte
// para que no pueda quedar una categoría de pesos con un movimiento en dólares.
export const SIMBOLO_CATEGORIA_FONDO: Record<CategoriaFondo, string> = {
  efectivo_ars: '$',
  transferencia_ars: '$',
  efectivo_usd: 'US$',
};

export type TipoMovimientoFondo = 'ingreso' | 'egreso';

export type MovimientoFondo = {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  categoria: CategoriaFondo;
  tipo: TipoMovimientoFondo;
  importe: number;
  descripcion: string;
  notas: string | null;
  anulado: boolean;
  registrado_por_nombre: string | null;
  registrado_por_foto_url: string | null;
  created_at: string;
};

export type ParamsMovimientoFondo = {
  fecha: string;
  categoria: CategoriaFondo;
  tipo: TipoMovimientoFondo;
  importe: number;
  descripcion: string;
  notas?: string;
};

const COLUMNAS = 'id, fecha, categoria, tipo, importe, descripcion, notas, anulado, registrado_por_nombre, registrado_por_foto_url, created_at';

export async function obtenerMovimientosFondos(supabase: SupabaseClient): Promise<MovimientoFondo[]> {
  return obtenerTodasLasFilas<MovimientoFondo>(
    supabase,
    'fondos_movimientos',
    COLUMNAS,
    [
      { columna: 'fecha', ascending: false },
      { columna: 'created_at', ascending: false },
    ],
    (q) => q.eq('anulado', false)
  );
}

// El saldo nunca se guarda: siempre Σingresos − Σegresos por categoría sobre
// los movimientos no anulados (obtenerMovimientosFondos ya filtra anulado=false,
// pero se vuelve a chequear acá por si en algún momento se le pasa una lista sin filtrar).
export function saldosPorCategoria(movimientos: Pick<MovimientoFondo, 'categoria' | 'tipo' | 'importe' | 'anulado'>[]): Record<CategoriaFondo, number> {
  const saldos: Record<CategoriaFondo, number> = { efectivo_ars: 0, transferencia_ars: 0, efectivo_usd: 0 };
  for (const m of movimientos) {
    if (m.anulado) continue;
    saldos[m.categoria] += m.tipo === 'ingreso' ? m.importe : -m.importe;
  }
  return saldos;
}

function validar(params: Pick<ParamsMovimientoFondo, 'descripcion' | 'importe'>): string | null {
  if (!params.descripcion.trim()) return 'La descripción no puede estar vacía.';
  if (!params.importe || params.importe <= 0) return 'El importe tiene que ser mayor a 0.';
  return null;
}

export async function registrarMovimientoFondo(supabase: SupabaseClient, params: ParamsMovimientoFondo): Promise<{ id: string } | { error: string }> {
  const problema = validar(params);
  if (problema) return { error: problema };
  const actor = getActor();
  const { data, error } = await supabase
    .from('fondos_movimientos')
    .insert({
      fecha: params.fecha,
      categoria: params.categoria,
      tipo: params.tipo,
      importe: params.importe,
      descripcion: params.descripcion.trim(),
      notas: params.notas?.trim() || null,
      registrado_por_nombre: actor?.nombre ?? null,
      registrado_por_foto_url: actor?.fotoUrl ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  const id = (data as { id: string }).id;
  await registrarAuditoria(supabase, {
    accion: `registró un ${params.tipo === 'ingreso' ? 'ingreso' : 'egreso'} manual de fondos en ${ETIQUETA_CATEGORIA_FONDO[params.categoria]}: "${params.descripcion.trim()}" por ${SIMBOLO_CATEGORIA_FONDO[params.categoria]}${params.importe}`,
    entidad: 'fondo_movimiento',
    entidadId: id,
    valorNuevo: { categoria: params.categoria, tipo: params.tipo, importe: params.importe },
  });
  return { id };
}

// Anular = soft-void, nunca se borra (mismo patrón que egresos/ingresos/cta_cte). Requiere motivo.
export async function anularMovimientoFondo(supabase: SupabaseClient, mov: MovimientoFondo, motivo: string): Promise<{ ok: true } | { error: string }> {
  if (!motivo.trim()) return { error: 'La anulación necesita un motivo.' };
  const { error } = await supabase
    .from('fondos_movimientos')
    .update({ anulado: true, notas: [mov.notas, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' — '), updated_at: new Date().toISOString() })
    .eq('id', mov.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `anuló un movimiento de fondos (${ETIQUETA_CATEGORIA_FONDO[mov.categoria]}): "${mov.descripcion}" por ${SIMBOLO_CATEGORIA_FONDO[mov.categoria]}${mov.importe} — ${motivo.trim()}`,
    entidad: 'fondo_movimiento',
    entidadId: mov.id,
    valorAnterior: { importe: mov.importe, tipo: mov.tipo, categoria: mov.categoria },
  });
  return { ok: true };
}
