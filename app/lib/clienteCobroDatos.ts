import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerTodasLasFilas } from './db';
import { armarCronograma, type Cronograma } from './clienteCobro';

// Cronograma de cobro por terminación de DNI (clientes_cobro_supabase.sql). null = el negocio todavía no corrió el SQL.
export async function obtenerCronograma(supabase: SupabaseClient): Promise<Cronograma | null> {
  const { data, error } = await supabase.from('cronograma_cobro').select('fuente, terminacion, dia').limit(500);
  if (error) return null;
  return armarCronograma((data as { fuente: string; terminacion: number; dia: number }[]) ?? []);
}

// Clientes que registraron algún pago (cuenta corriente / cuotas) desde el 1º del mes en curso, hora local.
// Sirve para no marcar "ya cobró – no pagó" a quien ya pagó este mes.
export async function clientesQuePagaronEsteMes(supabase: SupabaseClient, hoy: Date = new Date()): Promise<Set<string>> {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
  try {
    const filas = await obtenerTodasLasFilas<{ cliente_id: string }>(supabase, 'cta_cte_movimientos', 'cliente_id', [], (q) =>
      q.eq('tipo', 'abono').eq('concepto', 'pago').eq('anulado', false).gte('fecha', inicio.toISOString())
    );
    return new Set(filas.map((f) => f.cliente_id));
  } catch {
    return new Set();
  }
}
