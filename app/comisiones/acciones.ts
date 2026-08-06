'use server';

// Server action: la generación de comisiones corre EN EL SERVIDOR con la sesión
// del usuario (RLS por negocio). El cliente solo dispara; nunca calcula importes.
import { crearClienteServidor } from '../lib/supabase/server';
import { generarComisionesDeOrden, type ResultadoGeneracion } from '../lib/comisiones/generar';

export async function generarComisionesAccion(ordenId: string): Promise<ResultadoGeneracion> {
  const supabase = crearClienteServidor();
  return generarComisionesDeOrden(supabase, ordenId);
}
