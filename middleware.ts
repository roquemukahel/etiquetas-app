import { NextRequest, NextResponse } from 'next/server';
import { crearClienteMiddleware } from './app/lib/supabase/middleware';

const RUTAS_PUBLICAS = ['/login', '/registro'];

export async function middleware(request: NextRequest) {
  const { supabase, response } = crearClienteMiddleware(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esPublica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox).*)'],
};
