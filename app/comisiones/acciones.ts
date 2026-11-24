'use server';

// Server action: la generación de comisiones corre EN EL SERVIDOR con la sesión
// del usuario (RLS por negocio). El cliente solo dispara; nunca calcula importes.
import { crearClienteServidor } from '../lib/supabase/server';
import { generarComisionesDeOrden, reconciliarComisionesDeCliente, type ResultadoGeneracion } from '../lib/comisiones/generar';

export async function generarComisionesAccion(ordenId: string): Promise<ResultadoGeneracion> {
  const supabase = crearClienteServidor();
  return generarComisionesDeOrden(supabase, ordenId);
}

// Se llama después de cobrar, anular o corregir un pago de un cliente: ajusta las comisiones de sus ventas financiadas a lo cobrado.
export async function reconciliarComisionesClienteAccion(clienteId: string): Promise<{ ordenes: number; generadas: number; error: string | null }> {
  const supabase = crearClienteServidor();
  return reconciliarComisionesDeCliente(supabase, clienteId);
}
