'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Receipt, ScrollText, ArrowLeft, Menu, X } from 'lucide-react';
import { crearClienteNavegador } from '../lib/supabase/client';

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/admin/negocios', label: 'Negocios', icon: Building2, exact: false },
  { href: '/admin/pagos', label: 'Pagos', icon: Receipt, exact: false },
  { href: '/admin/auditoria', label: 'Auditoría', icon: ScrollText, exact: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = crearClienteNavegador();
  const pathname = usePathname();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('es_admin');
      setAutorizado(!!data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Todo /admin se ve siempre oscuro, sea cual sea el tema elegido en el
  // resto de la app — es un centro de control aparte, no una pantalla más
  // del sistema de venta. Se reusan los mismos tokens dark-* del resto de
  // la app (ver tailwind.config.js), solo se fuerza la clase "dark" acá.
  if (autorizado === null) {
    return (
      <div className="dark">
        <main className="min-h-screen bg-dark-bg flex items-center justify-center">
          <p className="text-sm text-dark-text-secondary">Cargando...</p>
        </main>
      </div>
    );
  }

  if (!autorizado) {
    return (
      <div className="dark">
        <main className="min-h-screen bg-dark-bg flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-dark-text-secondary">No tenés acceso a esta sección.</p>
          <Link href="/" className="text-sm text-dark-accent underline">
            Volver al panel
          </Link>
        </main>
      </div>
    );
  }

  const activo = (href: string, exact: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <div className="dark">
      <div className="min-h-screen bg-dark-bg text-dark-text flex">
        {/* Sidebar desktop */}
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-dark-border bg-dark-surface-elevated px-3 py-4 gap-1">
          <Link href="/" className="flex items-center gap-2 px-2 pb-4 text-sm text-dark-text-secondary hover:text-dark-text transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver a Qovento
          </Link>
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-dark-text-secondary">Panel Admin</p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActivo = activo(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActivo ? 'bg-dark-accent/15 text-dark-accent' : 'text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </aside>

        {/* Barra superior móvil */}
        <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-dark-surface-elevated border-b border-dark-border px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-display font-semibold">Panel Admin</span>
          <button
            type="button"
            aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuMovilAbierto((v) => !v)}
            className="text-dark-text"
          >
            {menuMovilAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuMovilAbierto && (
          <div className="md:hidden fixed inset-0 z-30 bg-dark-bg pt-14 px-4 flex flex-col gap-1">
            <Link
              href="/"
              onClick={() => setMenuMovilAbierto(false)}
              className="flex items-center gap-2 px-2 py-2 text-sm text-dark-text-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a Qovento
            </Link>
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActivo = activo(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuMovilAbierto(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    isActivo ? 'bg-dark-accent/15 text-dark-accent' : 'text-dark-text-secondary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8 mt-14 md:mt-0">{children}</main>
      </div>
    </div>
  );
}
