import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const RUTAS_PUBLICAS = [
  '/login',
  '/registro',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/completar-registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/boleta',
];

// Rutas donde no tiene sentido (o no corresponde todavía) exigir que el
// usuario ya tenga negocio/perfil creado: /completar-registro es
// justamente donde se crea, /admin lo usan los super_admins (que no tienen
// negocio propio), y el resto son pantallas públicas que un usuario sin
// perfil también puede necesitar ver.
const RUTAS_SIN_CHEQUEO_DE_NEGOCIO = [
  '/completar-registro',
  '/admin',
  '/login',
  '/registro',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/boleta',
];

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
  // /auth/callback intercambia el "code" de un enlace de Supabase (confirmar
  // cuenta, restablecer contraseña) por una sesión. En ese momento todavía
  // no hay cookies de sesión (recién se están por crear ahí adentro), así
  // que si pasara por la lógica de abajo el middleware lo trataría como "no
  // logueado" y lo mandaría a /login antes de llegar a procesar el code.
  if (
    request.nextUrl.pathname.startsWith('/api/webhooks/') ||
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname.startsWith('/api/soporte') ||
    request.nextUrl.pathname.startsWith('/auth/')
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

  // Con la confirmación de mail obligatoria, el negocio y el perfil recién
  // se crean en /completar-registro (ver ese archivo). Si alguien confirma
  // el mail pero después inicia sesión por /login en vez de terminar ese
  // paso (o entra desde otro dispositivo), quedaría con sesión pero sin
  // negocio — y todo el resto de la app rompe (RLS rechaza cualquier
  // insert/select porque no hay negocio_id). Este chequeo corre para
  // cualquier ruta, sin importar por dónde haya entrado, y lo manda a
  // completar ese paso antes de dejarlo pasar.
  if (user && !RUTAS_SIN_CHEQUEO_DE_NEGOCIO.some((r) => request.nextUrl.pathname.startsWith(r))) {
    const { data: perfil } = await supabase.from('perfiles').select('id').eq('id', user.id).maybeSingle();
    if (!perfil) {
      const url = request.nextUrl.clone();
      url.pathname = '/completar-registro';
      return NextResponse.redirect(url);
    }
  }

  // Estas rutas son públicas pero NO deben redirigir a un usuario ya logueado
  // (a diferencia de /login o /registro, que no tiene sentido ver estando adentro).
  const RUTAS_SIEMPRE_ACCESIBLES = ['/restablecer-contrasena', '/cuenta-desactivada', '/suscripcion-vencida', '/terminos', '/privacidad', '/seguimiento', '/boleta'];
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
