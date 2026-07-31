'use client';

import { useState } from 'react';
import { COLORES_IPHONE } from './lib/coloresIphone';

export default function SelectorColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const coincide = COLORES_IPHONE.find((c) => c.nombre.toLowerCase() === value.trim().toLowerCase());
  const [otro, setOtro] = useState(Boolean(value) && !coincide);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {COLORES_IPHONE.map((c) => (
          <button
            key={c.nombre}
            type="button"
            onClick={() => {
              onChange(c.nombre);
              setOtro(false);
            }}
            title={c.nombre}
            className={`h-8 w-8 rounded-full border-2 transition-transform ${
              value === c.nombre ? 'border-accent dark:border-dark-accent scale-110' : 'border-border dark:border-dark-border'
            }`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setOtro(true);
            onChange('');
          }}
          className={`h-8 px-3 rounded-full border text-xs font-medium shrink-0 ${
            otro
              ? 'border-accent dark:border-dark-accent text-accent dark:text-dark-accent'
              : 'border-border dark:border-dark-border text-muted dark:text-dark-text-secondary'
          }`}
        >
          Otro
        </button>
      </div>
      {otro ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribí el color"
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
        />
      ) : (
        value && <p className="text-xs text-muted dark:text-dark-text-secondary">Color elegido: {value}</p>
      )}
    </div>
  );
}
