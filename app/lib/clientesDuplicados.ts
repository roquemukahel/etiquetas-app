import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerTodasLasFilas } from './db';

// Aviso de cliente duplicado al cargar uno nuevo con el mismo DNI o teléfono.
// No bloquea (puede ser un familiar que comparte teléfono): se avisa y quien
// carga decide.
type ClienteLiviano = { id: string; nombre: string; apellido: string | null; dni: string | null; telefono: string | null };
export type Duplicado = { id: string; nombre: string; motivo: 'DNI' | 'teléfono' };

const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

// Dos teléfonos son el mismo si coinciden en los últimos 8 dígitos (ignora
// código de país, 0 y 15 delante, espacios y guiones).
export const mismoTelefono = (a: string | null | undefined, b: string | null | undefined) => {
  const x = soloDigitos(a);
  const y = soloDigitos(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
};
export const mismoDni = (a: string | null | undefined, b: string | null | undefined) => {
  const x = soloDigitos(a);
  const y = soloDigitos(b);
  return x.length >= 6 && x === y;
};

// Pura (testeable): qué clientes de `existentes` chocan con los datos nuevos.
export function encontrarDuplicados(
  existentes: ClienteLiviano[],
  nuevo: { dni?: string | null; telefono?: string | null },
  excluirId?: string
): Duplicado[] {
  const out: Duplicado[] = [];
  for (const c of existentes) {
    if (c.id === excluirId) continue;
    const nombre = `${c.nombre} ${c.apellido ?? ''}`.trim();
    if (nuevo.dni && mismoDni(nuevo.dni, c.dni)) out.push({ id: c.id, nombre, motivo: 'DNI' });
    else if (nuevo.telefono && mismoTelefono(nuevo.telefono, c.telefono)) out.push({ id: c.id, nombre, motivo: 'teléfono' });
  }
  return out;
}

export async function buscarClientesDuplicados(
  supabase: SupabaseClient,
  nuevo: { dni?: string | null; telefono?: string | null },
  excluirId?: string
): Promise<Duplicado[]> {
  if (!nuevo.dni?.trim() && !nuevo.telefono?.trim()) return [];
  const existentes = await obtenerTodasLasFilas<ClienteLiviano>(supabase, 'clientes', 'id, nombre, apellido, dni, telefono');
  return encontrarDuplicados(existentes, nuevo, excluirId);
}

export function textoDuplicados(dups: Duplicado[]): string {
  return dups
    .slice(0, 4)
    .map((d) => `• ${d.nombre} (${d.motivo})`)
    .join('\n');
}

// Sucursal que da de alta al cliente (se completa sola). Devuelve {} si el negocio
// no activó multisucursal o todavía no corrió la migración, así el alta no falla.
import { soportaMigracion } from './migraciones';
export async function origenDeCliente(supabase: SupabaseClient, sucursalId: string | null | undefined): Promise<{ sucursal_origen_id?: string }> {
  if (!sucursalId) return {};
  return (await soportaMigracion(supabase, 'clienteSucursalOrigen')) ? { sucursal_origen_id: sucursalId } : {};
}
