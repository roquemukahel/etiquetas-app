'use client';

import { useEffect, useState } from 'react';
import { useActor } from './lib/actor';
import { tienePermiso } from './lib/permisos';

// Ojo para ocultar el resumen financiero del inicio (los ingresos son sensibles:
// no deberían quedar a la vista de un cliente en el mostrador).
//  - Cualquiera puede OCULTARLO (tocar el ojo).
//  - Solo un administrador puede volver a MOSTRARLO.
//  - Además, si el actor no tiene el permiso "ver estadísticas" (configurable
//    por el dueño en Configuración > Vendedores), directamente no lo ve.
// El estado de ocultar se guarda por dispositivo (localStorage): si el dueño lo
// oculta, queda oculto aunque cambie de pantalla, hasta que un admin lo muestre.
export default function OjoResumenFinanciero({ children }: { children: React.ReactNode }) {
  const actor = useActor();
  const esAdmin = actor?.permisos?.esAdministrador ?? true;
  const puedeVer = tienePermiso(actor, 'ver_estadisticas');

  const [oculto, setOculto] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
    setOculto(localStorage.getItem('resumenFinancieroOculto') === '1');
  }, []);

  const ocultar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOculto(true);
    localStorage.setItem('resumenFinancieroOculto', '1');
  };
  const mostrar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!esAdmin) return; // solo un administrador puede volver a mostrarlo
    setOculto(false);
    localStorage.removeItem('resumenFinancieroOculto');
  };

  // Hasta montar (SSR/primer render) mostramos normal para no parpadear.
  const ocultoEfectivo = montado && (oculto || !puedeVer);

  if (ocultoEfectivo) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/60 mb-1">Ingresos este mes</p>
          <p className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-white/40 select-none">
            $ ••••••
          </p>
          <p className="text-[11px] text-white/40 mt-2">
            {esAdmin ? 'Oculto — tocá el ojo para mostrar' : 'Oculto — solo un administrador puede mostrarlo'}
          </p>
        </div>
        <button
          type="button"
          onClick={mostrar}
          aria-label={esAdmin ? 'Mostrar el resumen' : 'Solo un administrador puede mostrarlo'}
          title={esAdmin ? 'Mostrar' : 'Solo un administrador puede mostrarlo'}
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
        aria-label="Ocultar el resumen"
        title="Ocultar (privacidad)"
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
