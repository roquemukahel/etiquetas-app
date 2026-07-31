'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';

// Mismo criterio de exclusión que el selector de "quién trabaja": no tiene
// sentido un botón de acciones rápidas en pantallas públicas, de login, o de
// impresión (boletas). Se suma también /admin (panel de super-admin, no es
// un flujo de negocio) y cualquier ruta que contenga "/boleta".
const RUTAS_OCULTAS = [
  '/login',
  '/registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/boleta',
  '/admin',
];

const ACCIONES = [
  { href: '/ordenes/nueva', label: 'Nueva venta', icono: '🧾' },
  { href: '/clientes/nuevo', label: 'Nuevo cliente', icono: '👤' },
  { href: '/stock/nuevo', label: 'Nuevo ingreso', icono: '📦' },
  { href: '/servicio-tecnico', label: 'Nueva reparación', icono: '🔧' },
  { href: '/compras/nueva', label: 'Nueva compra', icono: '💳' },
];

export default function BotonFlotante() {
  const pathname = usePathname();
  const supabase = crearClienteNavegador();
  const [sesion, setSesion] = useState<'cargando' | 'si' | 'no'>('cargando');
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSesion(user ? 'si' : 'no');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const ocultarPorRuta = RUTAS_OCULTAS.some((r) => pathname?.startsWith(r)) || (pathname?.includes('/boleta') ?? false);

  if (ocultarPorRuta || sesion !== 'si') return null;

  return (
    <>
      {abierto && <div className="no-print fixed inset-0 z-30" onClick={() => setAbierto(false)} />}

      <div className="no-print fixed bottom-8 right-8 z-40 flex flex-col items-end gap-2">
        {abierto && (
          <div className="flex flex-col items-end gap-2 mb-1">
            {ACCIONES.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setAbierto(false)}
                className="animate-fade-in-up flex items-center gap-2.5 rounded-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated pl-4 pr-1.5 py-1.5 text-sm font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {a.label}
                <span className="h-8 w-8 rounded-full bg-accent-soft dark:bg-dark-accent-soft flex items-center justify-center text-base shrink-0">
                  {a.icono}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="relative h-14 w-14">
          <span className="animate-pulse-glow absolute inset-0 rounded-full bg-gradient-to-br from-accent to-accent-hover dark:from-dark-accent dark:to-dark-accent-hover" />
          <button
            onClick={() => setAbierto((v) => !v)}
            className={`relative h-14 w-14 rounded-full bg-gradient-to-br from-accent to-accent-hover dark:from-dark-accent dark:to-dark-accent-hover text-white flex items-center justify-center text-2xl font-light leading-none shadow-[0_10px_28px_-4px_rgba(53,92,222,0.55)] dark:shadow-[0_10px_28px_-4px_rgba(108,140,255,0.45)] hover:scale-105 active:scale-95 transition-transform duration-200 ${
              abierto ? 'rotate-45' : ''
            }`}
            aria-label={abierto ? 'Cerrar acciones rápidas' : 'Acciones rápidas'}
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}
