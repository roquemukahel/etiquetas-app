'use client';

import { useState } from 'react';
import Avatar from '../Avatar';

// Paleta categórica validada (ver skill de dataviz) contra las superficies
// reales de las cards de Qovento (blanco en claro, #111827 en oscuro):
// azul → naranja → aqua, en ese orden fijo, con un cupo de 3 nombrados +
// "Otros" en gris neutro para lo que sobre (así nunca generamos un color
// nuevo para un cuarto/quinto vendedor).
const COLOR_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'];
const COLOR_DARK = ['#3987e5', '#d95926', '#199e70'];
const OTROS_LIGHT = '#9CA3AF';
const OTROS_DARK = '#475569';

export type Dato = { nombre: string; valor: number; fotoUrl?: string | null };

function formatearValor(valor: number, moneda?: string, sufijo?: string) {
  if (moneda) return `${moneda}${Math.round(valor).toLocaleString('es-AR')}`;
  return `${valor.toLocaleString('es-AR')}${sufijo ?? ''}`;
}

// Medalla 🥇🥈🥉 para los puestos 1/2/3; del 4° en adelante queda el número.
// Da el toque estético de "podio" a todos los rankings.
export function PosicionRanking({ pos }: { pos: number }) {
  if (pos > 3) {
    return (
      <span className="w-6 text-xs text-muted dark:text-dark-text-secondary text-center shrink-0 tabular-nums">
        {pos}°
      </span>
    );
  }
  const medalla = pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉';
  return (
    <span aria-label={`Puesto ${pos}`} className="w-6 shrink-0 text-center text-lg leading-none">
      {medalla}
    </span>
  );
}

export function RankingBarras({ datos, moneda, sufijo }: { datos: Dato[]; moneda?: string; sufijo?: string }) {
  if (datos.length === 0) return <SinDatos />;
  const max = Math.max(1, ...datos.map((d) => d.valor));

  return (
    <div className="flex flex-col gap-3">
      {datos.map((d, i) => (
        <div key={d.nombre} className="flex items-center gap-3">
          <PosicionRanking pos={i + 1} />
          {d.fotoUrl !== undefined && <Avatar src={d.fotoUrl} nombre={d.nombre} size={38} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-medium truncate">{d.nombre}</span>
              <span className="text-xs text-muted dark:text-dark-text-secondary shrink-0 tabular-nums">
                {formatearValor(d.valor, moneda, sufijo)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-canvas dark:bg-dark-bg overflow-hidden">
              <div
                className="h-full rounded-full bg-accent dark:bg-dark-accent"
                style={{ width: `${Math.max(4, (d.valor / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function polarACartesiano(cx: number, cy: number, r: number, anguloDeg: number) {
  const rad = ((anguloDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcoPath(cx: number, cy: number, r: number, desdeDeg: number, hastaDeg: number) {
  // Círculo completo (un solo dato): el arco A-A no se dibuja bien, hacemos dos medios círculos.
  if (hastaDeg - desdeDeg >= 359.999) {
    const p1 = polarACartesiano(cx, cy, r, desdeDeg);
    const p2 = polarACartesiano(cx, cy, r, desdeDeg + 180);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 1 0 ${p2.x} ${p2.y} A ${r} ${r} 0 1 0 ${p1.x} ${p1.y} Z`;
  }
  const inicio = polarACartesiano(cx, cy, r, hastaDeg);
  const fin = polarACartesiano(cx, cy, r, desdeDeg);
  const grandArco = hastaDeg - desdeDeg <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${grandArco} 0 ${fin.x} ${fin.y} Z`;
}

export function RankingTorta({ datos, moneda, sufijo }: { datos: Dato[]; moneda?: string; sufijo?: string }) {
  const total = datos.reduce((acc, d) => acc + d.valor, 0);
  if (total <= 0) return <SinDatos />;

  const top = datos.slice(0, 3);
  const restoValor = datos.slice(3).reduce((acc, d) => acc + d.valor, 0);
  const slices = [
    ...top.map((d, i) => ({ nombre: d.nombre, valor: d.valor, fotoUrl: d.fotoUrl, light: COLOR_LIGHT[i], dark: COLOR_DARK[i] })),
    ...(restoValor > 0 ? [{ nombre: 'Otros', valor: restoValor, fotoUrl: undefined, light: OTROS_LIGHT, dark: OTROS_DARK }] : []),
  ];

  const segmentos = (colorKey: 'light' | 'dark') => {
    let acumulado = 0;
    return slices.map((s) => {
      const desde = (acumulado / total) * 360;
      acumulado += s.valor;
      const hasta = (acumulado / total) * 360;
      return <path key={s.nombre} d={arcoPath(80, 80, 70, desde, hasta)} fill={s[colorKey]} stroke="currentColor" strokeWidth={2} />;
    });
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg width={140} height={140} viewBox="0 0 160 160" className="shrink-0">
        <g className="dark:hidden text-white">{segmentos('light')}</g>
        <g className="hidden dark:inline text-dark-surface">{segmentos('dark')}</g>
      </svg>
      <div className="flex-1 w-full flex flex-col gap-2 text-sm">
        {slices.map((s) => (
          <div key={s.nombre} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 dark:hidden" style={{ backgroundColor: s.light }} />
              <span className="h-2.5 w-2.5 rounded-full shrink-0 hidden dark:inline-block" style={{ backgroundColor: s.dark }} />
              {s.fotoUrl !== undefined && <Avatar src={s.fotoUrl} nombre={s.nombre} size={36} />}
              <span className="truncate">{s.nombre}</span>
            </span>
            <span className="text-muted dark:text-dark-text-secondary shrink-0 tabular-nums">
              {Math.round((s.valor / total) * 100)}% · {formatearValor(s.valor, moneda, sufijo)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvolucionBarras({ datos, moneda }: { datos: { label: string; valor: number }[]; moneda: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (datos.length === 0) return <SinDatos />;
  const max = Math.max(1, ...datos.map((d) => d.valor));

  return (
    <div className="flex items-end gap-1 h-32">
      {datos.map((d, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end relative"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onClick={() => setHover(hover === i ? null : i)}
        >
          {hover === i && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink dark:bg-dark-surface-elevated text-white text-[10px] rounded-md px-2 py-1 shadow-elevated z-10">
              {moneda}
              {Math.round(d.valor).toLocaleString('es-AR')}
            </div>
          )}
          <div
            className="w-full max-w-[18px] rounded-t-sm bg-accent dark:bg-dark-accent transition-all"
            style={{ height: `${Math.max(3, (d.valor / max) * 100)}%` }}
          />
          <span className="text-[9px] text-muted dark:text-dark-text-secondary truncate max-w-full">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function SinDatos() {
  return <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-6">Sin datos para este período.</p>;
}
