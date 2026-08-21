'use client';

import { useEffect, useState } from 'react';
import { useActor } from './lib/actor';
import { tienePermiso } from './lib/permisos';
import { useT } from './lib/idioma';

// Ojo para ocultar el resumen financiero del inicio (los ingresos son sensibles:
// no deberían quedar a la vista de un cliente en el mostrador).
//  - Arranca SIEMPRE TAPADO al iniciar sesión (por privacidad).
//  - Cualquiera puede OCULTARLO (tocar el ojo).
//  - Solo un administrador puede MOSTRARLO, y ese "mostrado" dura únicamente la
//    sesión del navegador (sessionStorage): al cerrar y volver a entrar, vuelve
//    a estar tapado. Así nunca queda expuesto al iniciar sesión de nuevo.
//  - Además, si el actor no tiene el permiso "ver estadísticas" (configurable
//    por el dueño en Configuración > Vendedores), directamente no lo puede ver.
export default function OjoResumenFinanciero({ children }: { children: React.ReactNode }) {
  const actor = useActor();
  const t = useT();
  const esAdmin = actor?.permisos?.esAdministrador ?? true;
  const puedeVer = tienePermiso(actor, 'ver_estadisticas');

  const [oculto, setOculto] = useState(true); // por defecto SIEMPRE tapado
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
    // Solo se muestra si un admin lo reveló en ESTA misma sesión del navegador.
    // sessionStorage no persiste al cerrar el navegador → un nuevo inicio de
    // sesión siempre arranca tapado.
    try {
      setOculto(sessionStorage.getItem('resumenFinancieroVisible') !== '1');
    } catch {}
  }, []);

  const ocultar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOculto(true);
    try {
      sessionStorage.removeItem('resumenFinancieroVisible');
    } catch {}
  };
  const mostrar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!esAdmin) return; // solo un administrador puede mostrarlo
    setOculto(false);
    try {
      sessionStorage.setItem('resumenFinancieroVisible', '1');
    } catch {}
  };

  // Tapado también antes de montar (SSR/primer render): así el monto real nunca
  // llega a verse ni un instante al cargar la página.
  const ocultoEfectivo = !montado || oculto || !puedeVer;

  if (ocultoEfectivo) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/60 mb-1">{t('Ingresos este mes')}</p>
          <p className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-white/40 select-none">
            $ ••••••
          </p>
          <p className="text-[11px] text-white/40 mt-2">
            {esAdmin ? t('Oculto — tocá el ojo para mostrar') : t('Oculto — solo un administrador puede mostrarlo')}
          </p>
        </div>
        <button
          type="button"
          onClick={mostrar}
          aria-label={esAdmin ? t('Mostrar el resumen') : t('Solo un administrador puede mostrarlo')}
          title={esAdmin ? t('Mostrar') : t('Solo un administrador puede mostrarlo')}
          className={`shrink-0 rounded-full bg-white/10 p-2.5 text-white/70 ${esAdmin ? 'hover:bg-white/20' : 'opacity-60 cursor-not-allowed'}`}
        >
          <OjoCerrado />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={ocultar}
        aria-label={t('Ocultar el resumen')}
        title={t('Ocultar (privacidad)')}
        className="absolute -top-1 -right-1 z-10 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white/70"
      >
        <OjoAbierto />
      </button>
      {children}
    </div>
  );
}

function OjoAbierto() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OjoCerrado() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
