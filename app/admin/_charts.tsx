'use client';

// Gráficos mínimos y con propósito para el dashboard de Admin (nada de
// decoración): barras horizontales para distribución/uso, barras
// verticales para evolución en el tiempo, y un embudo de barras
// descendentes. Sin librería de gráficos — mismo criterio liviano que
// RankingBarras en app/estadisticas/graficos.tsx, pero sin medallas ni
// fotos (no aplican acá) para no meter emojis en un panel que
// explícitamente los evita.

import { EmptyState } from './_ui';

export function BarrasHorizontales({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  if (datos.length === 0) return <EmptyState titulo="Sin datos en este período" icono="—" />;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="flex flex-col gap-3">
      {datos.map((d) => (
        <div key={d.etiqueta} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs text-dark-text-secondary truncate">{d.etiqueta}</span>
          <div className="flex-1 h-2 rounded-full bg-dark-bg overflow-hidden">
            <div className="h-full rounded-full bg-dark-accent" style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-dark-text-secondary">{d.valor}</span>
        </div>
      ))}
    </div>
  );
}

export function BarrasVerticales({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  if (datos.length === 0) return <EmptyState titulo="Sin datos en este período" icono="—" />;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  // Si hay muchos puntos (rango largo) se muestran solo etiquetas cada
  // tantas barras, así no se pisan.
  const saltoEtiqueta = Math.max(1, Math.ceil(datos.length / 10));
  return (
    <div className="flex items-end gap-1 h-32">
      {datos.map((d, i) => (
        <div key={d.etiqueta} className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative">
          <div
            className="w-full rounded-t bg-dark-accent min-h-[2px]"
            style={{ height: `${Math.max((d.valor / max) * 100, 2)}%` }}
            title={`${d.etiqueta}: ${d.valor}`}
          />
          <span className="text-[9px] text-dark-text-secondary truncate w-full text-center">
            {i % saltoEtiqueta === 0 ? d.etiqueta : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Embudo({ pasos }: { pasos: { etiqueta: string; valor: number }[] }) {
  if (pasos.length === 0 || pasos[0].valor === 0) return <EmptyState titulo="Sin datos" icono="—" />;
  const max = pasos[0].valor;
  return (
    <div className="flex flex-col gap-2.5">
      {pasos.map((p, i) => {
        const pct = max > 0 ? (p.valor / max) * 100 : 0;
        const pctAnterior = i > 0 && pasos[i - 1].valor > 0 ? (p.valor / pasos[i - 1].valor) * 100 : null;
        return (
          <div key={p.etiqueta} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-dark-text-secondary truncate">{p.etiqueta}</span>
            <div className="flex-1 h-6 rounded-lg bg-dark-bg overflow-hidden">
              <div
                className="h-full rounded-lg bg-dark-accent flex items-center justify-end pr-2"
                style={{ width: `${Math.max(pct, 6)}%` }}
              >
                <span className="text-[10px] font-medium text-white tabular-nums">{p.valor}</span>
              </div>
            </div>
            {pctAnterior != null && (
              <span className="w-12 shrink-0 text-right text-[10px] text-dark-text-secondary tabular-nums">
                {pctAnterior.toFixed(0)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
