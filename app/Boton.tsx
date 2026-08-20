'use client';

import { ReactNode } from 'react';
import Link from 'next/link';

// Sistema de botones reutilizable — consolida lo que hoy se repite
// (rounded-xl bg-accent...) copiado en decenas de archivos, en vez de que
// cada pantalla nueva lo reescriba a mano. No reemplaza de golpe cada
// botón existente en la app (eso rompería más de lo que arregla); se usa
// en pantallas nuevas y en las que se van tocando.
export type BotonVariante = 'primario' | 'secundario' | 'ghost' | 'peligro' | 'exito';
export type BotonTamano = 'sm' | 'md' | 'lg';

const ALTURAS: Record<BotonTamano, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

// Sin degradados en todos los botones (solo primario lo usa, y muy sutil);
// sin sombras brillantes; rojo reservado para peligro, verde para éxito.
const VARIANTES: Record<BotonVariante, string> = {
  primario:
    'bg-accent dark:bg-dark-accent text-white hover:bg-accent-hover dark:hover:bg-dark-accent-hover border border-transparent',
  secundario:
    'bg-white dark:bg-dark-surface text-ink dark:text-dark-text border border-border dark:border-dark-border hover:bg-canvas dark:hover:bg-dark-bg',
  ghost: 'bg-transparent text-ink dark:text-dark-text border border-transparent hover:bg-canvas dark:hover:bg-dark-bg',
  peligro: 'bg-transparent text-bad border border-bad/30 hover:bg-bad/10',
  exito: 'bg-good text-white border border-transparent hover:opacity-90',
};

type PropsComunes = {
  variante?: BotonVariante;
  tamano?: BotonTamano;
  iconoIzq?: ReactNode;
  iconoDer?: ReactNode;
  cargando?: boolean;
  anchoCompleto?: boolean;
  className?: string;
  children?: ReactNode;
};

function Spinner({ tamano }: { tamano: BotonTamano }) {
  const px = tamano === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <svg className={`animate-spin ${px}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function claseBase(p: PropsComunes) {
  const tamano = p.tamano ?? 'md';
  return `inline-flex items-center justify-center rounded-xl font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-bg disabled:opacity-40 disabled:pointer-events-none ${
    ALTURAS[tamano]
  } ${VARIANTES[p.variante ?? 'primario']} ${p.anchoCompleto ? 'w-full' : ''} ${p.className ?? ''}`;
}

// Botón normal (<button>) — para acciones dentro de la página.
export function Boton({
  onClick,
  type = 'button',
  disabled,
  ...p
}: PropsComunes & { onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || p.cargando} className={claseBase(p)}>
      {p.cargando ? <Spinner tamano={p.tamano ?? 'md'} /> : p.iconoIzq}
      {p.children}
      {!p.cargando && p.iconoDer}
    </button>
  );
}

// Mismo look, pero como link — para acciones que navegan a otra pantalla.
export function BotonLink({ href, ...p }: PropsComunes & { href: string }) {
  return (
    <Link href={href} className={claseBase(p)}>
      {p.iconoIzq}
      {p.children}
      {p.iconoDer}
    </Link>
  );
}

// Botón de solo ícono — exige aria-label (no hay texto visible que lo reemplace).
export function BotonIcono({
  icono,
  ariaLabel,
  onClick,
  variante = 'ghost',
  tamano = 'md',
  disabled,
  cargando,
  className = '',
}: {
  icono: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  variante?: BotonVariante;
  tamano?: BotonTamano;
  disabled?: boolean;
  cargando?: boolean;
  className?: string;
}) {
  const tamanos: Record<BotonTamano, string> = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-11 w-11' };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || cargando}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`inline-flex items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-bg disabled:opacity-40 disabled:pointer-events-none ${tamanos[tamano]} ${VARIANTES[variante]} ${className}`}
    >
      {cargando ? <Spinner tamano={tamano} /> : icono}
    </button>
  );
}
