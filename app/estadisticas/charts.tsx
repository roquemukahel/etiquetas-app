'use client';

import { useState } from 'react';
import { PuntoSerie } from './datos';
import { formatMoneda } from './ui';

// Sparkline: línea mínima sin ejes, para meter dentro de un KPI.
export function Sparkline({ valores, alto = 28 }: { valores: number[]; alto?: number }) {
  if (valores.length < 2) return null;
  const W = 100;
  const max = Math.max(1, ...valores);
  const min = Math.min(0, ...valores);
  const rango = max - min || 1;
  const pts = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * W;
    const y = alto - ((v - min) / rango) * alto;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${alto}`} preserveAspectRatio="none" className="w-full text-accent dark:text-dark-accent" style={{ height: alto }}>
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Gráfico de evolución: serie actual (área + línea accent) con la del período
// anterior superpuesta en punteado gris. Una sola escala. Tooltip al hover.
export function LineAreaChart({
  puntos,
  moneda,
  compararActivo,
}: {
  puntos: PuntoSerie[];
  moneda: string;
  compararActivo: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (puntos.length === 0) {
    return <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-10">Sin datos para este período.</p>;
  }

  const W = 640;
  const H = 200;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const valores = puntos.map((p) => p.actual);
  const valoresPrev = compararActivo ? puntos.map((p) => p.anterior ?? 0) : [];
  const max = Math.max(1, ...valores, ...valoresPrev);

  const n = puntos.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${linePath(valores)} L ${x(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // Etiquetas del eje X: primera, última y algunas intermedias, sin amontonar.
  const paso = Math.max(1, Math.ceil(n / 7));
  const mostrarLabel = (i: number) => i === 0 || i === n - 1 || i % paso === 0;

  const pct = (a: number, b: number | null) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const i = Math.round(ratio * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {/* Grilla horizontal recesiva */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH - t * innerH}
            y2={padT + innerH - t * innerH}
            className="text-border dark:text-dark-border"
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}

        {/* Período anterior: línea punteada gris */}
        {compararActivo && (
          <path
            d={linePath(valoresPrev)}
            fill="none"
            className="text-muted/60 dark:text-dark-text-secondary/60"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Área + línea actual */}
        <path d={areaPath} className="text-accent/12 dark:text-dark-accent/15" fill="currentColor" stroke="none" />
        <path
          d={linePath(valores)}
          fill="none"
          className="text-accent dark:text-dark-accent"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Crosshair + punto en hover */}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} className="text-border dark:text-dark-border" stroke="currentColor" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(valores[hover])} r={4} className="text-accent dark:text-dark-accent" fill="currentColor" stroke="white" strokeWidth={1.5} />
          </>
        )}

        {/* Etiquetas X */}
        {puntos.map((p, i) =>
          mostrarLabel(i) ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted dark:fill-dark-text-secondary" style={{ fontSize: 10 }}>
              {p.label}
            </text>
          ) : null
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink dark:bg-dark-surface-elevated px-3 py-2 text-white shadow-elevated text-[11px] leading-snug"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="font-semibold mb-0.5">{puntos[hover].label}</p>
          <p>{formatMoneda(puntos[hover].actual, moneda)}</p>
          {compararActivo && puntos[hover].anterior != null && (
            <p className="text-white/70">
              Antes: {formatMoneda(puntos[hover].anterior || 0, moneda)}
              {pct(puntos[hover].actual, puntos[hover].anterior) != null && ` (${pct(puntos[hover].actual, puntos[hover].anterior)}%)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
