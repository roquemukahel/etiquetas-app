import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '../../lib/supabase/server';

// Ruta a la que apuntan los enlaces que manda Supabase (confirmación de
// email, recuperación de contraseña): intercambia el "code" por una sesión
// real (cookies) y redirige a donde corresponda según el flujo (`next`).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = crearClienteServidor();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
