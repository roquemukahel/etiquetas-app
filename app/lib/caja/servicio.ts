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

export async function obtenerCajas(supabase: SupabaseClient, sucursalId: string | null): Promise<Caja[]> {
  let q = supabase.from('cajas').select('id, sucursal_id, tipo, nombre, activa').eq('activa', true).order('tipo');
  q = sucursalId ? q.eq('sucursal_id', sucursalId) : q.is('sucursal_id', null);
  const { data } = await q;
  return (data as Caja[]) ?? [];
}

export async function renombrarCaja(supabase: SupabaseClient, cajaId: string, nombre: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cajas').update({ nombre: nombre.trim() }).eq('id', cajaId);
  return { error: error?.message ?? null };
}

export async function obtenerTurnoAbierto(supabase: SupabaseClient, cajaId: string): Promise<TurnoCaja | null> {
  const { data } = await supabase.from('caja_turnos').select('*').eq('caja_id', cajaId).eq('estado', 'abierta').maybeSingle();
  return (data as TurnoCaja) ?? null;
}

export async function obtenerHistorialTurnos(supabase: SupabaseClient, cajaId: string, limite = 30): Promise<TurnoCaja[]> {
  const { data } = await supabase
    .from('caja_turnos')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'cerrada')
    .order('numero', { ascending: false })
    .limit(limite);
  return (data as TurnoCaja[]) ?? [];
}

// Pagos de una caja dentro de un rango de fechas — usado tanto para el
// total EN VIVO del turno actual (desde=abierta_en, hasta=ahora) como para
// reimprimir un cierre viejo (desde=abierta_en, hasta=cerrada_en del turno).
export async function obtenerPagosDeCaja(
  supabase: SupabaseClient,
  caja: Pick<Caja, 'tipo' | 'sucursal_id'>,
  desde: string,
  hasta: string
): Promise<PagoParaCaja[]> {
  let q = supabase
    .from('pagos')
    .select('medio, monto, moneda')
    .eq('caja_tipo', caja.tipo)
    .eq('anulado', false)
    .gte('fecha', desde)
    .lte('fecha', hasta);
  q = caja.sucursal_id ? q.eq('sucursal_id', caja.sucursal_id) : q.is('sucursal_id', null);
  const { data } = await q;
  return (data as PagoParaCaja[]) ?? [];
}

export async function abrirTurno(
  supabase: SupabaseClient,
  cajaId: string,
  efectivoInicial: number,
  moneda: string,
  abiertaPor: string | null
): Promise<{ turno: TurnoCaja | null; error: string | null }> {
  const { data, error } = await supabase.rpc('caja_abrir_turno', {
    p_caja_id: cajaId,
    p_efectivo_inicial: efectivoInicial,
    p_moneda: moneda,
    p_abierta_por: abiertaPor,
  });
  if (error) return { turno: null, error: error.message };
  return { turno: data as TurnoCaja, error: null };
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

export async function reabrirTurno(supabase: SupabaseClient, turnoId: string): Promise<{ turno: TurnoCaja | null; error: string | null }> {
  const { data, error } = await supabase.rpc('caja_reabrir_turno', { p_turno_id: turnoId });
  if (error) return { turno: null, error: error.message };
  return { turno: data as TurnoCaja, error: null };
}
