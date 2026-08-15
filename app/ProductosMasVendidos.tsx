'use client';

import { useState } from 'react';

type Item = { nombre: string; cantidad: number; imagenUrl: string | null };

const MEDALLAS = [
  { emoji: '🥇', grad: 'from-amber-300 to-amber-500' },
  { emoji: '🥈', grad: 'from-slate-300 to-slate-400' },
  { emoji: '🥉', grad: 'from-orange-300 to-orange-500' },
];

// Antes era una sola lista "Productos más vendidos" mezclando teléfonos y
// accesorios: en un local que vende muchos más accesorios que equipos, los
// accesorios tapaban a los teléfonos y nunca se veían en el top 5. Ahora son
// dos pestañas separadas, cada una con su propio ranking y medallas.
export default function ProductosMasVendidos({ telefonos, accesorios }: { telefonos: Item[]; accesorios: Item[] }) {
  const [tab, setTab] = useState<'telefonos' | 'accesorios'>('telefonos');
  const lista = tab === 'telefonos' ? telefonos : accesorios;

  return (
    <div className="qv-card rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">Más vendidos</p>
        <div className="flex items-center gap-1 rounded-full bg-canvas dark:bg-dark-bg p-0.5 text-[11px] font-medium">
          <button
            onClick={() => setTab('telefonos')}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              tab === 'telefonos' ? 'bg-white dark:bg-dark-surface shadow text-ink dark:text-dark-text' : 'text-muted dark:text-dark-text-secondary'
            }`}
          >
            📱 Teléfonos
          </button>
          <button
            onClick={() => setTab('accesorios')}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              tab === 'accesorios' ? 'bg-white dark:bg-dark-surface shadow text-ink dark:text-dark-text' : 'text-muted dark:text-dark-text-secondary'
            }`}
          >
            🎧 Accesorios
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Todavía no hay ventas de {tab === 'telefonos' ? 'teléfonos' : 'accesorios'} este mes.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p, idx) => {
            const medalla = MEDALLAS[idx] ?? null;
            return (
              <div key={p.nombre} className="flex items-center gap-3">
                <div className="relative shrink-0">
                  {p.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagenUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover border border-border dark:border-dark-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-base">
                      📦
                    </div>
                  )}
                  {medalla && (
                    <span
                      className={`absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-gradient-to-b ${medalla.grad} border border-white dark:border-dark-surface shadow flex items-center justify-center text-[11px]`}
                    >
                      {medalla.emoji}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.nombre}</p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                    {p.cantidad} unidad{p.cantidad === 1 ? '' : 'es'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
