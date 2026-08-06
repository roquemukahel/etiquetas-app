'use client';

// ============================================================
// Componentes reutilizables del dashboard de Analítica.
// Tokens del sistema (accent/good/warn/bad, superficies claro/oscuro).
// Los montos sensibles se enmascaran con "oculto" (ojito estilo homebanking).
// ============================================================

import React from 'react';

export function formatMoneda(n: number, moneda: string): string {
  return `${moneda}${Math.round(n).toLocaleString('es-AR')}`;
}

// Leyenda al pasar el mouse o enfocar. Accesible (aria-label + title).
export function InfoTip({ texto }: { texto: string }) {
  return (
    <span className="relative inline-flex group align-middle">
      <span
        tabIndex={0}
        role="img"
        aria-label={texto}
        title={texto}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted/50 dark:border-dark-text-secondary/50 text-[8px] font-semibold leading-none text-muted dark:text-dark-text-secondary cursor-help"
      >
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-ink dark:bg-dark-surface-elevated px-3 py-2 text-[11px] font-normal normal-case leading-snug text-white text-left opacity-0 shadow-elevated transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {texto}
      </span>
    </span>
  );
}

// Flecha + variación % y absoluta vs período anterior, con color semántico.
// positivoEsBueno=false invierte el color (ej. deuda vencida: subir es malo).
export function TrendIndicator({
  pct,
  abs,
  moneda,
  positivoEsBueno = true,
}: {
  pct: number | null;
  abs: number;
  moneda?: string;
  positivoEsBueno?: boolean;
}) {
  const sinCambio = Math.round(abs) === 0;
  const sube = abs > 0;
  const bueno = positivoEsBueno ? sube : !sube;
  const color = sinCambio ? 'text-muted dark:text-dark-text-secondary' : bueno ? 'text-good' : 'text-bad';
  const flecha = sinCambio ? '→' : sube ? '↑' : '↓';
  const absTxt = moneda ? formatMoneda(Math.abs(abs), moneda) : Math.abs(abs).toLocaleString('es-AR');
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      <span aria-hidden>{flecha}</span>
      {pct != null ? `${Math.abs(pct).toFixed(1).replace('.', ',')}%` : 'nuevo'}
      <span className="text-muted dark:text-dark-text-secondary font-normal">· {sube ? '+' : sinCambio ? '' : '−'}{absTxt}</span>
    </span>
  );
}

export function StatCard({
  etiqueta,
  valor,
  tooltip,
  variacion,
  positivoEsBueno = true,
  moneda,
  tono,
  oculto,
  sensible,
  onClick,
  children,
}: {
  etiqueta: string;
  valor: string;
  tooltip?: string;
  variacion?: { pct: number | null; abs: number };
  positivoEsBueno?: boolean;
  moneda?: string;
  tono?: string;
  oculto?: boolean; // enmascara el valor si es sensible (plata)
  sensible?: boolean;
  onClick?: () => void;
  children?: React.ReactNode; // sparkline u otro contenido
}) {
  const enmascarado = oculto && sensible;
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`text-left rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-1 ${
        onClick ? 'hover:border-accent/40 dark:hover:border-dark-accent/40 transition-colors cursor-pointer' : ''
      }`}
    >
      <span className="text-[12px] text-muted dark:text-dark-text-secondary flex items-center">
        {etiqueta}
        {tooltip && <InfoTip texto={tooltip} />}
      </span>
      <span className={`font-display font-semibold leading-tight text-2xl ${tono ?? ''} ${enmascarado ? 'tracking-wider' : ''}`}>
        {enmascarado ? '••••••' : valor}
      </span>
      {variacion && !enmascarado && (
        <TrendIndicator pct={variacion.pct} abs={variacion.abs} moneda={moneda} positivoEsBueno={positivoEsBueno} />
      )}
      {children && !enmascarado && <div className="mt-1">{children}</div>}
    </Comp>
  );
}

export function SeccionCard({
  titulo,
  subtitulo,
  accion,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold leading-tight">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted dark:text-dark-text-secondary mt-0.5">{subtitulo}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icono = '📊', titulo, texto }: { icono?: string; titulo: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-1.5 py-10 px-4">
      <span className="text-2xl opacity-70">{icono}</span>
      <p className="text-sm font-medium">{titulo}</p>
      {texto && <p className="text-xs text-muted dark:text-dark-text-secondary max-w-xs">{texto}</p>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-canvas dark:bg-dark-bg ${className}`} />;
}

// Chips de segmento reutilizables (para selectores de métrica, vista, etc.).
export function SegmentedChips<T extends string>({
  valor,
  opciones,
  onChange,
  size = 'md',
}: {
  valor: T;
  opciones: { key: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const py = size === 'sm' ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-sm';
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-0.5">
      {opciones.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-lg font-medium transition-colors ${py} ${
            valor === o.key
              ? 'bg-white dark:bg-dark-surface-elevated text-ink dark:text-dark-text shadow-card'
              : 'text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Pestañas del dashboard. Scroll horizontal en móvil, sin competir con el
// menú lateral. La pestaña activa lleva subrayado accent.
export function AnalyticsTabs<T extends string>({
  valor,
  tabs,
  onChange,
}: {
  valor: T;
  tabs: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="border-b border-border dark:border-dark-border overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
              valor === t.key
                ? 'text-ink dark:text-dark-text'
                : 'text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text'
            }`}
          >
            {t.label}
            {valor === t.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent dark:bg-dark-accent" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
