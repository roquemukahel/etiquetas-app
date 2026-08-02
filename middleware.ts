import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const RUTAS_PUBLICAS = ['/login', '/registro', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta'];

// Vercel siempre deja accesible el dominio *.vercel.app de cada proyecto,
// además del dominio propio — no se puede desactivar. Para que en la
// práctica quede como si no existiera, cualquier visita por ese dominio
// (o por cualquier otro que no sea el propio) redirige de una a qovento.app.
// No aplica a las rutas de API (webhooks, cron), que server-a-server pueden
// llegar por cualquier host.
const DOMINIO_CANONICO = 'qovento.app';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const esRutaApi = request.nextUrl.pathname.startsWith('/api/');
  // En desarrollo local (npm run dev) el host es localhost — nunca redirigir ahí.
  const esLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!esRutaApi && !esLocal && host && host !== DOMINIO_CANONICO && host !== `www.${DOMINIO_CANONICO}`) {
    const destino = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${DOMINIO_CANONICO}`);
    return NextResponse.redirect(destino, 308);
  }

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
  // (a diferencia de /login, que no tiene sentido ver estando adentro).
  // /registro sí puede hacer falta verla estando logueado: es donde se
  // recupera una cuenta que quedó sin negocio creado (ver app/registro).
  const RUTAS_SIEMPRE_ACCESIBLES = ['/registro', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta'];
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
