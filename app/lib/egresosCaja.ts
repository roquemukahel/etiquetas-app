// ============================================================
// Egresos que salen de una caja — la contracara de ingresos.ts. Un egreso pagado en efectivo desde la caja del local
// SALE del cajón, así que baja el efectivo esperado del turno (antes solo sumaban ventas e ingresos y el egreso no se veía).
//
// Qué cuenta como "sale de esta caja":
//  - medio de pago efectivo (transferencia/débito/crédito no pasan por el cajón),
//  - pagado desde la caja (no desde la billetera de un dueño),
//  - de la misma sucursal y moneda, cargado desde que se abrió el turno,
//  - sin ser el retiro automático del cierre (ese tiene caja_turno_id: es el efectivo ya contado, no un gasto del turno).
// La caja de la que sale se elige al cargar el egreso (egresos_caja_supabase.sql); los egresos sin esa elección salen de Venta diaria.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerTodasLasFilas } from './db';
import { soportaMigracion } from './migraciones';

export type EgresoDeCaja = {
  id: string;
  fecha: string;
  descripcion: string;
  importe: number;
  moneda: string;
  medio_pago: string | null;
  tipo: string;
  created_at: string;
  sucursal_id: string | null;
  registrado_por_nombre: string | null;
  pagado_desde?: string | null;
  caja_tipo?: string | null;
  caja_turno_id?: string | null;
};

const COLUMNAS_BASE = 'id, fecha, descripcion, importe, moneda, medio_pago, tipo, created_at, sucursal_id, registrado_por_nombre, caja_turno_id';

// De qué caja sale un egreso: la elegida al cargarlo, o Venta diaria si no se eligió (egresos viejos o sin la migración).
export function cajaDeEgreso(e: Pick<EgresoDeCaja, 'caja_tipo'>): string {
  return e.caja_tipo === 'financiamiento' ? 'financiamiento' : 'venta_diaria';
}

// ¿Este egreso saca efectivo del cajón de `cajaTipo`?
export function saleDeLaCaja(e: EgresoDeCaja, cajaTipo: string): boolean {
  if (e.caja_turno_id) return false; // retiro automático del cierre de un turno
  if (e.pagado_desde === 'billetera_dueno') return false;
  if (e.medio_pago !== 'efectivo') return false;
  return cajaDeEgreso(e) === cajaTipo;
}

export function egresosEnEfectivo(egresos: EgresoDeCaja[], cajaTipo: string): number {
  return egresos.filter((e) => saleDeLaCaja(e, cajaTipo)).reduce((acc, e) => acc + (e.importe || 0), 0);
}

// Egresos del período que se cargaron SIN medio de pago y por eso no se pueden descontar solos del efectivo: la pantalla
// los avisa para que se completen (si no, parece que "el egreso no restó").
export function egresosSinMedio(egresos: EgresoDeCaja[]): EgresoDeCaja[] {
  return egresos.filter((e) => !e.caja_turno_id && e.pagado_desde !== 'billetera_dueno' && !e.medio_pago);
}

// Egresos de la sucursal de una caja desde que abrió el turno. Sin filtrar por medio ni caja: eso lo hacen las funciones de arriba.
export async function obtenerEgresosDeCaja(
  supabase: SupabaseClient,
  caja: { sucursal_id: string | null },
  desde: string,
  hasta?: string,
  moneda?: string
): Promise<EgresoDeCaja[]> {
  const [conDuenos, conCaja] = await Promise.all([soportaMigracion(supabase, 'egresosDuenos'), soportaMigracion(supabase, 'egresosCaja')]);
  const columnas = COLUMNAS_BASE + (conDuenos ? ', pagado_desde' : '') + (conCaja ? ', caja_tipo' : '');
  // Si falla, el error sube hasta la pantalla de Caja: un efectivo esperado sin los egresos sería un número equivocado y silencioso.
  return obtenerTodasLasFilas<EgresoDeCaja>(supabase, 'egresos', columnas, [{ columna: 'created_at', ascending: false }], (q) => {
    q = q.eq('anulado', false).gte('created_at', desde);
    if (hasta) q = q.lte('created_at', hasta);
    if (moneda) q = q.eq('moneda', moneda);
    return caja.sucursal_id ? q.eq('sucursal_id', caja.sucursal_id) : q.is('sucursal_id', null);
  });
}
