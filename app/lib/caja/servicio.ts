// Puente con Supabase para el módulo Caja — el cálculo en sí (totales,
// esperado, diferencia) vive en motor.ts, puro y testeado; acá solo se
// trae/guarda lo mínimo. Abrir/cerrar/reabrir turno pasan por RPCs
// atómicas (caja_supabase.sql) para que dos personas cerrando cajas
// distintas al mismo tiempo, o la misma caja desde dos pestañas, no
// generen números de turno pisados.
import { SupabaseClient } from '@supabase/supabase-js';
import { TipoCaja, PagoParaCaja } from './motor';

export type Caja = {
  id: string;
  sucursal_id: string | null;
  tipo: TipoCaja;
  nombre: string;
  activa: boolean;
};

export type TurnoCaja = {
  id: string;
  caja_id: string;
  numero: number;
  abierta_en: string;
  abierta_por: string | null;
  efectivo_inicial: number;
  moneda: string;
  cerrada_en: string | null;
  cerrada_por: string | null;
  efectivo_declarado: number | null;
  efectivo_esperado: number | null;
  diferencia: number | null;
  observacion: string | null;
  estado: 'abierta' | 'cerrada';
};

// Idempotente — se puede llamar cada vez que se entra a la pantalla sin
// riesgo de duplicar cajas (ver unique index en caja_supabase.sql).
export async function asegurarCajasPredeterminadas(supabase: SupabaseClient, sucursalId: string | null) {
  await supabase.rpc('caja_asegurar_predeterminadas', { p_sucursal_id: sucursalId });
}

// Las funciones de lectura de acá abajo TIRAN si Supabase devuelve un
// error, en vez de devolver "vacío" como si de verdad no hubiera nada — un
// fallo de red/RLS que se confunde con "esta caja está cerrada" podía hacer
// que alguien intentara abrir un turno pensando que no había uno activo
// (mismo tipo de bug que ya se corrigió en cuenta corriente: un fetch
// fallido nunca debe leerse como "está en cero").
export async function obtenerCajas(supabase: SupabaseClient, sucursalId: string | null): Promise<Caja[]> {
  let q = supabase.from('cajas').select('id, sucursal_id, tipo, nombre, activa').eq('activa', true).order('tipo');
  q = sucursalId ? q.eq('sucursal_id', sucursalId) : q.is('sucursal_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Caja[]) ?? [];
}

export async function renombrarCaja(supabase: SupabaseClient, cajaId: string, nombre: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cajas').update({ nombre: nombre.trim() }).eq('id', cajaId);
  return { error: error?.message ?? null };
}

export async function obtenerTurnoAbierto(supabase: SupabaseClient, cajaId: string): Promise<TurnoCaja | null> {
  const { data, error } = await supabase.from('caja_turnos').select('*').eq('caja_id', cajaId).eq('estado', 'abierta').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TurnoCaja) ?? null;
}

export async function obtenerHistorialTurnos(supabase: SupabaseClient, cajaId: string, limite = 30): Promise<TurnoCaja[]> {
  const { data, error } = await supabase
    .from('caja_turnos')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'cerrada')
    .order('numero', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data as TurnoCaja[]) ?? [];
}

// Pagos de una caja dentro de un rango de fechas — usado tanto para el
// total EN VIVO del turno actual (desde=abierta_en, sin "hasta") como para
// reimprimir un cierre viejo (desde=abierta_en, hasta=cerrada_en del turno).
// "hasta" es OPCIONAL a propósito: para el turno abierto, filtrar por
// `fecha &lt;= new Date().toISOString()` compara contra el reloj del
// NAVEGADOR, no el del servidor — si el reloj del cajero está unos segundos
// atrasado, una venta recién cobrada (con fecha puesta por el servidor)
// podía quedar afuera del total en vivo. Sin "hasta", simplemente se trae
// todo desde que abrió, sin ese límite frágil.
//
// "moneda" también es opcional: si se pasa, filtra solo esa moneda — el
// turno opera en una sola moneda (ver caja_cerrar_turno), así que un pago en
// otra moneda no debe sumarse a este cierre.
export async function obtenerPagosDeCaja(
  supabase: SupabaseClient,
  caja: Pick<Caja, 'tipo' | 'sucursal_id'>,
  desde: string,
  hasta?: string,
  moneda?: string
): Promise<PagoParaCaja[]> {
  let q = supabase.from('pagos').select('medio, monto, moneda').eq('caja_tipo', caja.tipo).eq('anulado', false).gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  if (moneda) q = q.eq('moneda', moneda);
  q = caja.sucursal_id ? q.eq('sucursal_id', caja.sucursal_id) : q.is('sucursal_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as PagoParaCaja[]) ?? [];
}

export async function cerrarTurno(
  supabase: SupabaseClient,
  turnoId: string,
  efectivoDeclarado: number,
  observacion: string | null,
  cerradaPor: string | null
): Promise<{ turno: TurnoCaja | null; error: string | null }> {
  const { data, error } = await supabase.rpc('caja_cerrar_turno', {
    p_turno_id: turnoId,
    p_efectivo_declarado: efectivoDeclarado,
    p_observacion: observacion,
    p_cerrada_por: cerradaPor,
  });
  if (error) return { turno: null, error: error.message };
  return { turno: data as TurnoCaja, error: null };
}

// Usado solo para poder auditar QUÉ se borra al reabrir un turno (ver
// handleReabrir en app/caja/page.tsx) — caja_reabrir_turno() elimina el
// turno siguiente auto-creado, y esa eliminación necesita quedar
// registrada igual que cualquier otro borrado de la app.
export async function obtenerTurnoPorNumero(supabase: SupabaseClient, cajaId: string, numero: number): Promise<TurnoCaja | null> {
  const { data, error } = await supabase.from('caja_turnos').select('*').eq('caja_id', cajaId).eq('numero', numero).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TurnoCaja) ?? null;
}

export async function reabrirTurno(supabase: SupabaseClient, turnoId: string): Promise<{ turno: TurnoCaja | null; error: string | null }> {
  const { data, error } = await supabase.rpc('caja_reabrir_turno', { p_turno_id: turnoId });
  if (error) return { turno: null, error: error.message };
  return { turno: data as TurnoCaja, error: null };
}
