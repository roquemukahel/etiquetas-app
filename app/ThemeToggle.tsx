'use client';

import { useEffect, useState } from 'react';
import { getTema, setTema, Tema } from './lib/theme';

const OPCIONES: { valor: Tema; label: string; emoji: string }[] = [
  { valor: 'light', label: 'Claro', emoji: '☀️' },
  { valor: 'dark', label: 'Oscuro', emoji: '🌙' },
  { valor: 'qovento', label: 'Qovento', emoji: '💎' },
];

export default function ThemeToggle() {
  const [tema, setTemaState] = useState<Tema>('light');

  useEffect(() => {
    setTemaState(getTema());
  }, []);

  const elegir = (t: Tema) => {
    setTema(t);
    setTemaState(t);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col gap-3">
      <div>
        <p className="text-base font-medium text-ink dark:text-dark-text">Apariencia</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">Elegí cómo se ve la app</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            onClick={() => elegir(o.valor)}
            className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 transition-colors active:scale-[0.98] ${
              tema === o.valor
                ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                : 'border-border dark:border-dark-border hover:border-accent/40 dark:hover:border-dark-accent/40'
            }`}
          >
            <span className="text-xl leading-none">{o.emoji}</span>
            <span className="text-sm font-medium text-ink dark:text-dark-text">{o.label}</span>
          </button>
        ))}
      </div>
      {tema === 'qovento' && (
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Modo Qovento: fondo azulado de la marca en toda la app. ✨
        </p>
      )}
    </div>
  );
}
