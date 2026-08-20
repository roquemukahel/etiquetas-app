import { ReactNode } from 'react';

// Tarjeta base reutilizable — consolida el patrón
// "rounded-2xl bg-white dark:bg-dark-surface border ... shadow-card" que
// hoy se repite copiado y pegado en decenas de archivos. No reemplaza de
// golpe cada uso existente (eso sería reescribir pantallas enteras sin
// necesidad); nuevas tarjetas y las que se vayan tocando pueden usar esta.
//
// `firma` activa el detalle Q-Frame (ver .qv-card en styles/globals.css):
// solo para tarjetas protagonistas (métricas importantes, resúmenes,
// estados ilustrados, alertas relevantes) — no aplicar a todo.
export function QCard({
  children,
  firma = false,
  microetiqueta,
  padding = 'md',
  className = '',
  as: Componente = 'div',
}: {
  children: ReactNode;
  firma?: boolean;
  microetiqueta?: string;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  const paddings: Record<string, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6',
  };
  return (
    <Componente
      className={`relative rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card ${paddings[padding]} ${
        firma ? 'qv-card' : ''
      } ${className}`}
    >
      {firma && microetiqueta && (
        <span className="absolute top-3 right-6 text-[9px] font-semibold uppercase tracking-wider text-accent dark:text-dark-accent">
          {microetiqueta}
        </span>
      )}
      {children}
    </Componente>
  );
}
