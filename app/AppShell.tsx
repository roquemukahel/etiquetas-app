'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { ICONOS } from './Iconos';
import QMark from './QMark';
import { useT } from './lib/idioma';
import { useSucursalActual, setSucursalManual, getSucursalManual } from './lib/sucursal';
import { obtenerSucursales, type Sucursal } from './lib/sucursales';

// El sidebar solo existe en pantallas grandes (ver <aside className="hidden
// lg:flex">) — en el celular la navegación sigue exactamente igual que
// siempre (flechita atrás en cada pantalla), porque ahí es donde se usa la
// app a diario en el local. Esto es a propósito, no un descuido: no tiene
// sentido meterle un sidebar a una pantalla de 375px de ancho.
const RUTAS_SIN_SIDEBAR = [
  '/login',
  '/registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/cuenta/',
  '/boleta',
  '/admin',
];

// Pantallas operativas (listas de trabajo día a día): el fondo de marca del
// modo Qovento se atenúa acá para no competir con la información — se
// mantiene expresivo en Inicio, Estadísticas y estados vacíos importantes,
// donde no hay una lista densa que proteger. Ver la regla `.fondo-sutil` en
// styles/globals.css.
const RUTAS_FONDO_SUTIL = [
  '/clientes',
  '/ordenes',
  '/stock',
  '/comisiones',
  '/canje',
  '/servicio-tecnico',
  '/cuentas-por-cobrar',
];

const NAV = [
  { href: '/', label: 'Inicio', icono: 'inicio' },
  { href: '/ordenes', label: 'Órdenes', icono: 'ordenes' },
  { href: '/stock', label: 'Stock', icono: 'stock' },
  { href: '/clientes', label: 'Clientes', icono: 'clientes' },
  { href: '/cuentas-por-cobrar', label: 'Cuentas por cobrar', icono: 'cobrar' },
  { href: '/comisiones', label: 'Comisiones', icono: 'estadisticas' },
  { href: '/canje', label: 'Plan Canje', icono: 'canje' },
  { href: '/servicio-tecnico', label: 'Servicio Técnico', icono: 'servicio' },
  { href: '/compras', label: 'Compras', icono: 'compra' },
  { href: '/proveedores', label: 'Proveedores', icono: 'proveedores' },
  { href: '/egresos', label: 'Egresos', icono: 'documento' },
  { href: '/plan-ahorro', label: 'Plan de ahorro', icono: 'ahorro' },
  { href: '/estadisticas', label: 'Estadísticas', icono: 'estadisticas' },
  { href: '/configuracion/sucursales', label: 'Sucursales', icono: 'local' },
  { href: '/configuracion', label: 'Configuración', icono: 'configuracion' },
  { href: '/configuracion/soporte', label: 'Soporte', icono: 'soporte' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();
  const [sesion, setSesion] = useState<'cargando' | 'si' | 'no'>('cargando');
  const [negocio, setNegocio] = useState<{ nombre: string; logo_url: string | null } | null>(null);
  const [diasPrueba, setDiasPrueba] = useState<number | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [menuSucursalAbierto, setMenuSucursalAbierto] = useState(false);
  const { id: sucursalActualId, fija: sucursalFija } = useSucursalActual();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSesion(user ? 'si' : 'no');
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( nombre, logo_url, estado_suscripcion, fecha_fin_prueba )')
          .eq('id', user.id)
          .single();
        const neg = (perfil as any)?.negocios ?? null;
        setNegocio(neg);
        if (neg?.estado_suscripcion === 'trialing' && neg?.fecha_fin_prueba) {
          const restantes = Math.ceil((new Date(neg.fecha_fin_prueba).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          setDiasPrueba(Math.max(restantes, 0));
        }
        try {
          const listaSucursales = await obtenerSucursales(supabase, false);
          setSucursales(listaSucursales);
          // qovento:sucursal_manual vive en localStorage DE ESTE NAVEGADOR,
          // no de la cuenta — si roque (u otra persona) usa dos negocios
          // distintos en el mismo navegador y en uno eligió una sucursal a
          // mano, esa selección quedaba pegada al cambiar de cuenta. Para un
          // negocio que nunca activó sucursales (listaSucursales vacía) o
          // que activó pero no tiene ESA sucursal, filtraba todo por un id
          // que no existe acá y dejaba Stock/Órdenes/Servicio Técnico vacíos
          // — mismo bug que ya se blindó para el actor (ver el useEffect de
          // validación en SelectorDeActor.tsx), pero nunca se replicó acá.
          const manualId = getSucursalManual();
          if (manualId && !listaSucursales.some((s) => s.id === manualId)) {
            setSucursalManual(null);
            // Inicio ya se renderizó en el servidor con la cookie vieja
            // (el id que no existe acá) — sin este refresh, seguiría
            // mostrando todo vacío hasta la próxima navegación completa.
            router.refresh();
          }
        } catch {
          // Tabla sucursales todavía no existe en este negocio (no se
          // corrió sucursales_supabase.sql) — el sidebar sigue funcionando
          // exactamente igual, simplemente sin el bloque de sucursal.
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // startsWith a secas confundiría '/stock' con '/stock-publico' (página
    // pública, no operativa) — exige que el siguiente carácter sea el fin
    // de la ruta o una barra, no cualquier sufijo.
    const esSutil = RUTAS_FONDO_SUTIL.some((r) => pathname === r || pathname?.startsWith(r + '/'));
    document.documentElement.classList.toggle('fondo-sutil', esSutil);
  }, [pathname]);

  const ocultar =
    RUTAS_SIN_SIDEBAR.some((r) => pathname?.startsWith(r)) ||
    (pathname?.includes('/boleta') ?? false) ||
    (pathname?.includes('/etiqueta/') ?? false) ||
    (pathname === '/' && sesion === 'no');

  if (ocultar || sesion !== 'si') return <>{children}</>;

  const esActivo = (href: string) => (href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false));
  const mostrarAvisoPrueba = diasPrueba !== null && !pathname?.startsWith('/configuracion/suscripcion');

  // Inicio, Estadísticas y Órdenes leen esta selección (cookie/localStorage
  // de app/lib/sucursal.ts) para filtrar lo que muestran — sin el refresh,
  // Inicio (Server Component) no se entera hasta la próxima navegación
  // entera, igual que pasa con el selector de idioma.
  const elegirSucursal = (id: string | null) => {
    setSucursalManual(id);
    setMenuSucursalAbierto(false);
    router.refresh();
  };

  return (
    <div>
      {mostrarAvisoPrueba && (
        <div className="no-print sticky top-[52px] z-30 w-full bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent text-xs px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
          <span>
            {t('Te quedan')} <strong>{diasPrueba}</strong> {diasPrueba === 1 ? t('día') : t('días')} {t('de prueba gratis.')}
          </span>
          <Link
            href="/configuracion/suscripcion"
            className="shrink-0 rounded-full bg-accent dark:bg-dark-accent text-white px-3 py-1 font-medium"
          >
            {t('Realizar el pago')}
          </Link>
        </div>
      )}

      {/* El aside es fixed (fuera del flujo), así que el ancho real lo pone
         el padding-left del div de contenido, no un flex. top-[52px] deja
         lugar al cartel fijo "Trabajando como..." de SelectorDeActor (sticky
         top-0, fuera de este componente); si además se muestra el aviso de
         prueba (otro sticky, justo debajo), se suma su alto para que no se
         tapen entre sí. */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:w-64 ${mostrarAvisoPrueba ? 'lg:top-[88px]' : 'lg:top-[52px]'} lg:bottom-0 lg:left-0 lg:z-20 lg:border-r lg:border-border dark:lg:border-dark-border lg:bg-white dark:lg:bg-dark-surface`}
      >

        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border dark:border-dark-border">
          {negocio?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={negocio.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border flex items-center justify-center shrink-0">
              <QMark size={22} />
            </div>
          )}
          <p className="text-sm font-display font-semibold truncate">{negocio?.nombre || 'Qovento'}</p>
        </div>

        {sucursales.length > 0 && (
          <div className="relative px-3 pt-3">
            <button
              type="button"
              onClick={() => !sucursalFija && setMenuSucursalAbierto((v) => !v)}
              disabled={sucursalFija}
              className={`w-full flex items-center gap-2 rounded-xl border border-border dark:border-dark-border px-3 py-2 text-xs ${
                sucursalFija ? 'cursor-default' : 'hover:bg-canvas dark:hover:bg-dark-bg'
              }`}
            >
              <span aria-hidden="true" className="[&_svg]:h-4 [&_svg]:w-4 shrink-0 text-muted dark:text-dark-text-secondary">
                {ICONOS.local}
              </span>
              <span className="min-w-0 flex-1 text-left truncate font-medium">
                {sucursalActualId ? sucursales.find((s) => s.id === sucursalActualId)?.nombre : t('Todas las sucursales')}
              </span>
              {!sucursalFija && (
                <span className="text-muted dark:text-dark-text-secondary shrink-0">▾</span>
              )}
            </button>
            {sucursalFija && (
              <p className="px-1 pt-1 text-[10px] text-muted dark:text-dark-text-secondary">{t('Sucursal fija (Configuración → Vendedores/Técnicos)')}</p>
            )}
            {menuSucursalAbierto && (
              <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1 z-30">
                <button
                  type="button"
                  onClick={() => elegirSucursal(null)}
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-canvas dark:hover:bg-dark-bg ${
                    !sucursalActualId ? 'font-medium text-accent dark:text-dark-accent' : ''
                  }`}
                >
                  🏬 {t('Todas las sucursales')}
                </button>
                {sucursales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => elegirSucursal(s.id)}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-canvas dark:hover:bg-dark-bg ${
                      s.id === sucursalActualId ? 'font-medium text-accent dark:text-dark-accent' : ''
                    }`}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
          {NAV.map((item) => {
            const activo = esActivo(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:h-5 [&_svg]:w-5 ${
                  activo
                    ? 'bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent'
                    : 'text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg hover:text-ink dark:hover:text-dark-text'
                }`}
              >
                {ICONOS[item.icono]}
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border dark:border-dark-border">
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted dark:text-dark-text-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-3.5 w-3.5 object-contain" />
            Qovento
          </p>
        </div>
      </aside>

      {/* Versión celular del bloque de arriba: el aside completo es
         hidden lg:flex (ver comentario al principio del archivo — en
         pantallas chicas no hay sidebar), así que acá va un botón
         flotante equivalente. Vive DENTRO de este componente (no en un
         componente aparte) para heredar gratis las mismas exclusiones de
         ruta/sesión que ya resolvió el "if (ocultar || sesion !== 'si')"
         de arriba, en vez de duplicar esa lista en otro lado. */}
      {sucursales.length > 0 && !sucursalFija && (
        <div className="no-print lg:hidden fixed bottom-3 left-3 z-40">
          {menuSucursalAbierto && (
            <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1">
              <button
                type="button"
                onClick={() => elegirSucursal(null)}
                className={`block w-full text-left px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg ${
                  !sucursalActualId ? 'font-medium text-accent dark:text-dark-accent' : ''
                }`}
              >
                🏬 {t('Todas las sucursales')}
              </button>
              {sucursales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => elegirSucursal(s.id)}
                  className={`block w-full text-left px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg ${
                    s.id === sucursalActualId ? 'font-medium text-accent dark:text-dark-accent' : ''
                  }`}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuSucursalAbierto((v) => !v)}
            className="rounded-full border border-white/30 bg-ink/70 text-white text-xs font-medium px-2.5 py-1 backdrop-blur-sm hover:bg-ink/90 transition-colors"
          >
            🏬 {sucursalActualId ? sucursales.find((s) => s.id === sucursalActualId)?.nombre : t('Todas las sucursales')}
          </button>
        </div>
      )}

      <div className="lg:pl-64">{children}</div>
    </div>
  );
}
