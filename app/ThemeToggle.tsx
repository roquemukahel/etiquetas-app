'use client';

import { useEffect, useState } from 'react';
import { getTema, setTema, Tema } from './lib/theme';

export default function ThemeToggle() {
  const [tema, setTemaState] = useState<Tema>('light');

  useEffect(() => {
    setTemaState(getTema());
  }, []);

  const toggle = () => {
    const nuevo: Tema = tema === 'light' ? 'dark' : 'light';
    setTema(nuevo);
    setTemaState(nuevo);
  };

  return (
    <button
      onClick={toggle}
      className="w-full rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex items-center justify-between hover:border-accent/40 dark:hover:border-dark-accent/40 hover:shadow-elevated transition-all active:scale-[0.98]"
    >
      <div className="text-left">
        <span className="text-base font-medium block text-ink dark:text-dark-text">Modo oscuro</span>
        <span className="text-xs text-muted dark:text-dark-text-secondary">
          {tema === 'dark' ? 'Activado' : 'Desactivado'}
        </span>
      </div>
      <div
        className={`h-7 w-12 rounded-full shrink-0 transition-colors relative ${
          tema === 'dark' ? 'bg-accent dark:bg-dark-accent' : 'bg-black/10'
        }`}
      >
        <div
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-card transition-transform ${
            tema === 'dark' ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}
