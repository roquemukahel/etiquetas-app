import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const RUTAS_PUBLICAS = ['/login', '/registro', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta', '/comprobante-plan-ahorro'];

// El deployment de PRODUCCIÓN de Vercel siempre queda accesible además por
// su propio dominio genérico (*.vercel.app) — no se puede desactivar. Para
// que en la práctica quede como si no existiera, cualquier visita a
// producción que no sea por el dominio propio redirige a qovento.app.
// No aplica a las rutas de API (webhooks, cron), que server-a-server pueden
// llegar por cualquier host — y, importante, tampoco aplica a los
// deployments de VISTA PREVIA de otras ramas (Vercel pone VERCEL_ENV
// distinto de "production" ahí): esos se visitan a propósito por su
// propio link de Vercel, para probar cambios sin tocar qovento.app. Si no
// filtráramos por VERCEL_ENV, este redirect también los mandaría de
// vuelta a producción, haciendo imposible probar cualquier rama nueva.
const DOMINIO_CANONICO = 'qovento.app';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const esRutaApi = request.nextUrl.pathname.startsWith('/api/');
  // En desarrollo local (npm run dev) el host es localhost — nunca redirigir ahí.
  const esLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const esProduccion = process.env.VERCEL_ENV === 'production';

  if (esProduccion && !esRutaApi && !esLocal && host && host !== DOMINIO_CANONICO && host !== `www.${DOMINIO_CANONICO}`) {
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
  const RUTAS_SIEMPRE_ACCESIBLES = ['/registro', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta', '/comprobante-plan-ahorro'];
  const esPantallaDeBloqueo = RUTAS_SIEMPRE_ACCESIBLES.some((r) => request.nextUrl.pathname.startsWith(r));

  if (user && esPublica && !esPantallaDeBloqueo) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && !esPublica) {
    // Antes eran dos llamadas RPC en fila (negocio_activo, luego
    // negocio_suscripcion_activa) — dos viajes de ida y vuelta a la base,
    // en SERIE, en cada página que se visita. negocio_estado_acceso()
    // junta las dos respuestas en un solo viaje (ver
    // negocio_estado_acceso_supabase.sql). Si por lo que sea la función
    // todavía no existe (no se corrió el SQL) esto no tira error: falla
    // "abierto" — igual que fallaba cada RPC suelta antes — así que no
    // bloquea a nadie, simplemente no protege esas dos pantallas hasta
    // correr el SQL.
    const { data: estadoAcceso } = (await supabase.rpc('negocio_estado_acceso').single()) as {
      data: { activo: boolean; suscripcion_activa: boolean } | null;
    };
    if (estadoAcceso?.activo === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/cuenta-desactivada';
      return NextResponse.redirect(url);
    }

    if (estadoAcceso?.suscripcion_activa === false) {
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
