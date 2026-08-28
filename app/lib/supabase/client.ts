import { createBrowserClient } from '@supabase/ssr';

// Ojo: NO hacer `ReturnType<typeof createBrowserClient>` directo — al ser
// createBrowserClient una función genérica, TypeScript no termina de resolver
// los tipos condicionales de sus parámetros de tipo por defecto cuando se la
// referencia "en frío" (sin invocarla), y el resultado (`Schema` sin
// resolver) hace que cualquier `.from(...).select(...)` en TODA la app pierda
// el tipo de sus filas (decenas de `.map((m) => ...)` en otros archivos pasan
// a marcar "implicit any"). Envolviéndola en esta función sin genéricos
// propios, la llamada interna a createBrowserClient queda resuelta de forma
// concreta y el tipo de retorno se infiere bien.
function inicializarCliente() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Singleton: antes cada componente que llamaba a esta función se creaba su
// PROPIA instancia de Supabase (con su propio cliente de auth interno) — en
// una sola carga de Inicio, eso significaba 3 instancias distintas cada una
// revalidando la sesión por su cuenta contra el servidor, en serie (el
// cliente de auth de Supabase serializa sus propias llamadas internamente),
// sumando ~800ms muertos antes de poder mostrar nada. Reusar la misma
// instancia es el patrón que la propia documentación de Supabase recomienda
// para el cliente de navegador.
let cliente: ReturnType<typeof inicializarCliente> | undefined;

export function crearClienteNavegador() {
  if (!cliente) {
    cliente = inicializarCliente();
    envolverGetUserConCache(cliente);
  }
  return cliente;
}

// `auth.getUser()` valida contra el servidor cada vez que se llama (a
// propósito, es más seguro que leer solo la sesión local) — pero ~40
// pantallas de la app lo llaman cada una por su cuenta apenas montan, sin
// saber que otras 2 o 3 están haciendo exactamente lo mismo en la misma
// carga de página. El singleton de arriba ya evita instancias duplicadas;
// esto evita las llamadas de red duplicadas: se comparte una única promesa
// (en vuelo o recién resuelta) por unos segundos, y se invalida al toque
// ante cualquier evento real de auth (login/logout/refresh de token), así
// que nunca puede quedar una sesión vieja pegada.
function envolverGetUserConCache(supabase: ReturnType<typeof inicializarCliente>) {
  const original = supabase.auth.getUser.bind(supabase.auth);
  const TTL_MS = 3000;
  let promesaCacheada: ReturnType<typeof original> | null = null;
  let cacheValidaHasta = 0;

  supabase.auth.getUser = ((...args: Parameters<typeof original>) => {
    if (args.length > 0) return original(...args);
    if (promesaCacheada && Date.now() < cacheValidaHasta) return promesaCacheada;
    promesaCacheada = original();
    cacheValidaHasta = Date.now() + TTL_MS;
    return promesaCacheada;
  }) as typeof original;

  supabase.auth.onAuthStateChange(() => {
    promesaCacheada = null;
    cacheValidaHasta = 0;
  });
}
