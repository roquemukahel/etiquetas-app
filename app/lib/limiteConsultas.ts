import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_CONSULTAS_POR_MINUTO } from './ordenPublica';

// Tope de consultas por minuto por IP para los enlaces públicos. El conteo vive en la base (consumir_limite_consulta, ver
// orden_publica_supabase.sql) porque en Vercel cada pedido puede caer en una instancia distinta y un contador en memoria
// no alcanzaría. Si la base no responde (o el SQL todavía no se corrió) se usa un conteo en memoria de esa instancia: no
// frena a quien reparte los pedidos entre instancias, pero tampoco deja la puerta abierta del todo ni tira el enlace.
export function ipDeLaPeticion(headers: Headers): string {
  // En Vercel el primer valor de x-forwarded-for es la IP real del que consulta.
  const reenviada = headers.get('x-forwarded-for');
  if (reenviada) return reenviada.split(',')[0].trim() || 'desconocida';
  return headers.get('x-real-ip')?.trim() || 'desconocida';
}

const enMemoria = new Map<string, { ventana: number; cantidad: number }>();

function contarEnMemoria(clave: string, ahora: number): number {
  const ventana = Math.floor(ahora / 60000);
  if (enMemoria.size > 5000) {
    for (const [k, v] of enMemoria) if (v.ventana < ventana) enMemoria.delete(k);
  }
  const actual = enMemoria.get(clave);
  if (!actual || actual.ventana !== ventana) {
    enMemoria.set(clave, { ventana, cantidad: 1 });
    return 1;
  }
  actual.cantidad += 1;
  return actual.cantidad;
}

export async function superaElLimite(supabase: SupabaseClient, clave: string, maximo = MAX_CONSULTAS_POR_MINUTO): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('consumir_limite_consulta', { p_clave: clave });
    if (!error && typeof data === 'number') return data > maximo;
  } catch {
    // sigue con el conteo en memoria
  }
  return contarEnMemoria(clave, Date.now()) > maximo;
}

// Segundos que faltan para que arranque el próximo minuto (cuando se libera el cupo).
export const segundosParaReintentar = (ahora = new Date()) => 60 - ahora.getUTCSeconds();
