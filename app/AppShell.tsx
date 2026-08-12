'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { ICONOS } from './Iconos';
import QMark from './QMark';

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
  { href: '/plan-ahorro', label: 'Plan de ahorro', icono: 'ahorro' },
  { href: '/estadisticas', label: 'Estadísticas', icono: 'estadisticas' },
  { href: '/configuracion', label: 'Configuración', icono: 'configuracion' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = crearClienteNavegador();
  const [sesion, setSesion] = useState<'cargando' | 'si' | 'no'>('cargando');
  const [negocio, setNegocio] = useState<{ nombre: string; logo_url: string | null } | null>(null);
  const [diasPrueba, setDiasPrueba] = useState<number | null>(null);

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
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocultar =
    RUTAS_SIN_SIDEBAR.some((r) => pathname?.startsWith(r)) ||
    (pathname?.includes('/boleta') ?? false) ||
    (pathname?.includes('/etiqueta/') ?? false) ||
    (pathname === '/' && sesion === 'no');

  if (ocultar || sesion !== 'si') return <>{children}</>;

  const esActivo = (href: string) => (href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false));
  const mostrarAvisoPrueba = diasPrueba !== null && !pathname?.startsWith('/configuracion/suscripcion');

  return (
    <div>
      {mostrarAvisoPrueba && (
        <div className="no-print sticky top-[52px] z-30 w-full bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent text-xs px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
          <span>
            Te quedan <strong>{diasPrueba}</strong> día{diasPrueba === 1 ? '' : 's'} de prueba gratis.
          </span>
          <Link
            href="/configuracion/suscripcion"
            className="shrink-0 rounded-full bg-accent dark:bg-dark-accent text-white px-3 py-1 font-medium"
          >
            Realizar el pago
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
                {item.label}
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

      <div className="lg:pl-64">{children}</div>
    </div>
  );
}
