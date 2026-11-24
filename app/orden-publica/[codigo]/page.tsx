import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { ipDeLaPeticion, superaElLimite } from '../../lib/limiteConsultas';
import { normalizarCodigo } from '../../lib/ordenPublica';

// Enlace corto para el cliente (el que va en el QR del ticket y en el WhatsApp): /orden-publica/<código> lleva a la misma
// pantalla de seguimiento de siempre (/seguimiento/<token>), donde el cliente ve el estado y puede aprobar el presupuesto.
// La app lee el mismo código por /orden-publica/<código>/json.
export const dynamic = 'force-dynamic';

export default async function OrdenPublica({ params }: { params: { codigo: string } }) {
  const codigo = normalizarCodigo(params.codigo);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!codigo || !url || !clave) notFound();

  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  if (await superaElLimite(supabase, `orden:${ipDeLaPeticion(headers())}`)) notFound();

  const { data, error } = await supabase.from('reparaciones').select('token_seguimiento').eq('codigo_seguimiento', codigo).maybeSingle();
  // Un fallo de la base no es "código inexistente": se deja que lo atrape la pantalla de error (y Sentry) en vez de mostrar 404.
  if (error) throw error;
  if (!data?.token_seguimiento) notFound();
  redirect(`/seguimiento/${data.token_seguimiento}`);
}
