import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarFallo } from './escritura';
import { soportaMigracion } from './migraciones';

// La batería de un equipo tiene que acompañarlo cuando pasa por Servicio Técnico (compra → orden → Stock, Plan Canje → orden
// → Stock, Standby → orden → Stock): la orden guarda el porcentaje (reparaciones.salud_bateria, ver
// reparaciones_bateria_supabase.sql) y al volver al Stock se copia al equipo. Mientras el negocio no corra ese SQL, todo
// sigue como antes (el porcentaje no viaja, pero nada se rompe).

// Para sumar al crear la orden: el campo solo si hay porcentaje y la columna existe.
export async function campoBateriaServicio(supabase: SupabaseClient, bateria: number | null | undefined): Promise<{ salud_bateria?: number }> {
  if (bateria == null) return {};
  return (await soportaMigracion(supabase, 'bateriaServicio')) ? { salud_bateria: bateria } : {};
}

// Para leer al sacar el equipo de la orden. Las listas de Servicio Técnico piden columnas fijas, por eso se lee aparte.
export async function bateriaDeReparacion(supabase: SupabaseClient, reparacionId: string): Promise<number | null> {
  if (!(await soportaMigracion(supabase, 'bateriaServicio'))) return null;
  const { data, error } = await supabase.from('reparaciones').select('salud_bateria').eq('id', reparacionId).maybeSingle();
  if (error) {
    registrarFallo(error, 'leer la batería de la orden de Servicio Técnico');
    return null;
  }
  return (data as { salud_bateria: number | null } | null)?.salud_bateria ?? null;
}
