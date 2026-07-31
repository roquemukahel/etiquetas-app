import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const RUTAS_PUBLICAS = ['/login', '/registro', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta'];

export async function middleware(request: NextRequest) {
  // Los webhooks (ej. Lemon Squeezy) y los cron jobs (ej. Vercel Cron) son
  // servidor-a-servidor: nunca traen sesión de usuario, y se autentican
  // solos (firma propia o el secreto de CRON_SECRET) dentro de la ruta. Si
  // los dejáramos pasar por la lógica de abajo, este middleware los trataría
  // como "no logueado" e intentaría redirigirlos a /login, lo que rompe el pedido.
  // El formulario de contacto de la landing pública (/api/soporte) también
  // lo puede usar alguien sin cuenta: no toca datos de ningún negocio, solo
  // reenvía un mail a una dirección fija.
  if (
    request.nextUrl.pathname.startsWith('/api/webhooks/') ||
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname.startsWith('/api/soporte')
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esPublica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));
  // La raíz muestra la landing pública si no hay sesión (la decide la propia
  // página, no el middleware), así que no la redirigimos a /login.
  const esRaiz = request.nextUrl.pathname === '/';

  if (!user && !esPublica && !esRaiz) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Estas rutas son públicas pero NO deben redirigir a un usuario ya logueado
  // (a diferencia de /login o /registro, que no tiene sentido ver estando adentro).
  const RUTAS_SIEMPRE_ACCESIBLES = ['/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta'];
  const esPantallaDeBloqueo = RUTAS_SIEMPRE_ACCESIBLES.some((r) => request.nextUrl.pathname.startsWith(r));

  if (user && esPublica && !esPantallaDeBloqueo) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && !esPublica) {
    const { data: activo } = await supabase.rpc('negocio_activo');
    if (activo === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/cuenta-desactivada';
      return NextResponse.redirect(url);
    }

    const { data: suscripcionActiva } = await supabase.rpc('negocio_suscripcion_activa');
    if (suscripcionActiva === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/suscripcion-vencida';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
};
