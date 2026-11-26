// Compras pendientes: equipos comprados que todavía no entraron al Stock (ni a Standby ni a Servicio
// Técnico, que las sacan de "pendiente"). Es la lista donde hay que buscar antes de cargar un equipo a
// mano en Stock, para no cargarlo de cero si ya está comprado y solo falta terminar de ingresarlo desde
// la compra (mismo criterio que canjesPendientes/equiposEnStandby — ver canje.ts/standby.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerTodasLasFilas } from './db';
import { coincidenciasPorImeiOModelo } from './canje';

export type CompraParaStock = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  precio: number | null;
};

export const COLUMNAS_COMPRA_PARA_STOCK = 'id, modelo, capacidad_gb, color, imei, precio';

export async function comprasPendientes(supabase: SupabaseClient): Promise<CompraParaStock[]> {
  return obtenerTodasLasFilas<CompraParaStock>(
    supabase,
    'compras',
    COLUMNAS_COMPRA_PARA_STOCK,
    [{ columna: 'created_at', ascending: false }],
    (q) => q.eq('estado', 'pendiente')
  );
}

// De las compras pendientes, las que pueden ser el equipo que se está cargando a mano (ver el
// comentario de coincidenciasPorImeiOModelo en canje.ts para el criterio de IMEI/modelo).
export function comprasCoincidentes(
  pendientes: CompraParaStock[],
  imei: string,
  modelo: string
): { porImei: CompraParaStock[]; porModelo: CompraParaStock[] } {
  return coincidenciasPorImeiOModelo(pendientes, imei, modelo);
}
