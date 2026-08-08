'use client';

import type { ColorConImagen } from './lib/coloresModelo';

// Selector de color mostrando un iPhone real por cada color. Al tocar uno se
// elige el color. Cada teléfono "flota" suave (animate-flotar en el wrapper) y
// hace un leve zoom al pasar el mouse (scale en la imagen, que es un elemento
// distinto para no chocar con el transform de la flotación).
export default function SelectorColorImagen({
  colores,
  value,
  onChange,
}: {
  colores: ColorConImagen[];
  value: string;
  onChange: (v: string) => void;
}) {
  const elegido = value.trim().toLowerCase();
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {colores.map((c, i) => {
        const sel = elegido === c.nombre.toLowerCase();
        return (
          <button
            key={c.nombre}
            type="button"
            onClick={() => onChange(c.nombre)}
            title={c.nombre}
            aria-pressed={sel}
            className={`group relative flex flex-col items-center gap-1.5 rounded-2xl border p-2 pt-3 transition-colors ${
              sel
                ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft ring-2 ring-accent/30 dark:ring-dark-accent/30'
                : 'border-border dark:border-dark-border hover:border-accent/40 dark:hover:border-dark-accent/40'
            }`}
          >
            <span className="animate-flotar" style={{ animationDelay: `${(i % 3) * 0.4 + (i >= 3 ? 0.2 : 0)}s` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imagen}
                alt={`iPhone ${c.nombre}`}
                loading="lazy"
                className="h-24 sm:h-28 w-auto object-contain drop-shadow-md transition-transform duration-300 ease-out group-hover:scale-110"
              />
            </span>
            <span className={`text-[11px] font-medium ${sel ? 'text-accent dark:text-dark-accent' : 'text-muted dark:text-dark-text-secondary'}`}>
              {c.nombre}
            </span>
            {sel && (
              <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-accent dark:bg-dark-accent text-white text-[10px] leading-4 text-center">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
