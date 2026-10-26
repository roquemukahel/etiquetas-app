import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarAuditoria } from './auditoria';
import { registrarFallo } from './escritura';
import { dispositivoOrigenDe, reubicarEquipoDeServicio } from './standby';
import { FINALIZADOS } from './reparaciones';

// Un equipo que se está cargando al Stock puede ser el mismo que sigue en Servicio Técnico (por ejemplo, un equipo
// propio que ya se reparó y quedó cargado en la orden). Acá se busca por IMEI esa orden, y si se confirma que ya
// está reparado se agrega al Stock y la orden se cierra: deja de aparecer en Servicio Técnico, pero el historial
// (costos, repuestos, trabajos) queda guardado, igual que cuando se usa "Agregar al Stock" desde Servicio Técnico.

export type ReparacionConImei = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  imei: string | null;
  estado: string;
  cliente_id: string | null;
  fecha_reparado: string | null;
};

const COLUMNAS_REPARACION_CON_IMEI = 'id, numero_orden, modelo, imei, estado, cliente_id, fecha_reparado';

// Las órdenes abiertas (ni entregadas ni canceladas, ni ya pasadas al Stock) cuyo IMEI es el tipeado.
// `exacto: false` sirve para el aviso mientras se tipea: alcanza con que lo escrito sea el comienzo del IMEI.
export async function reparacionesAbiertasConImei(
  supabase: SupabaseClient,
  imei: string,
  { exacto = true }: { exacto?: boolean } = {}
): Promise<ReparacionConImei[]> {
  const limpio = imei.replace(/\s+/g, '');
  if (limpio.length < (exacto ? 6 : 8)) return [];
  let consulta = supabase
    .from('reparaciones')
    .select(COLUMNAS_REPARACION_CON_IMEI)
    .not('estado', 'in', `(${FINALIZADOS.join(',')})`)
    .or('agregado_a_stock.is.null,agregado_a_stock.eq.false')
    .limit(5);
  consulta = exacto ? consulta.eq('imei', limpio) : consulta.like('imei', `${limpio}%`);
  const { data, error } = await consulta;
  if (error) {
    registrarFallo(error, 'buscar el equipo en Servicio Técnico');
    return [];
  }
  return (data as unknown as ReparacionConImei[]) ?? [];
}

// De esas órdenes, las que son de un equipo propio (sin cliente): las únicas que se pueden cerrar al pasarlas al Stock.
// Una orden con cliente es el teléfono de otra persona y nunca se cierra desde acá.
export function propias(reparaciones: ReparacionConImei[]): ReparacionConImei[] {
  return reparaciones.filter((r) => !r.cliente_id);
}

export function textoDeOrdenes(reparaciones: ReparacionConImei[]): string {
  return reparaciones.map((r) => r.numero_orden || r.modelo || '').filter(Boolean).join(', ');
}

// Si la orden salió de un equipo que ya existe (y no está ni en Stock ni en Standby), ese mismo equipo es el que vuelve.
export async function equipoDeOrigen(supabase: SupabaseClient, reparaciones: ReparacionConImei[]): Promise<string | null> {
  for (const r of reparaciones) {
    const id = await dispositivoOrigenDe(supabase, r.id);
    if (id) return id;
  }
  return null;
}

// Trae de vuelta al Stock el equipo de origen (misma regla que "Agregar al Stock" de Servicio Técnico). `usado: false` =
// no había equipo de origen disponible y hay que crear uno nuevo.
export async function reutilizarEquipoDeOrigen(
  supabase: SupabaseClient,
  reparaciones: ReparacionConImei[]
): Promise<{ usado: boolean; id: string | null; error: string | null }> {
  for (const r of reparaciones) {
    const origen = await dispositivoOrigenDe(supabase, r.id);
    if (!origen) continue;
    const resultado = await reubicarEquipoDeServicio(supabase, r.id, 'stock');
    if (resultado.error) return { usado: false, id: null, error: resultado.error };
    if (resultado.usado) return { usado: true, id: origen, error: null };
  }
  return { usado: false, id: null, error: null };
}

// Cierra las órdenes de equipo propio una vez que el equipo ya está en el Stock.
export async function cerrarReparacionesAlPasarAlStock(supabase: SupabaseClient, reparaciones: ReparacionConImei[]): Promise<{ error: string | null }> {
  let primerError: string | null = null;
  for (const r of reparaciones) {
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from('reparaciones')
      .update({ estado: 'entregado', estado_actualizado_at: ahora, agregado_a_stock: true, fecha_reparado: r.fecha_reparado ?? ahora })
      .eq('id', r.id);
    if (error) {
      registrarFallo(error, 'cerrar la orden de Servicio Técnico al pasar el equipo al Stock');
      primerError = primerError ?? error.message;
      continue;
    }
    await registrarAuditoria(supabase, {
      accion: `agregó al Stock un equipo que estaba en Servicio Técnico y cerró su orden (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorAnterior: { estado: r.estado },
    });
  }
  return { error: primerError };
}
