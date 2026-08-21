'use client';

import { useEffect, useState } from 'react';
import { getTema, setTema, Tema } from './lib/theme';
import { QCard } from './QCard';
import { ICONOS } from './Iconos';
import { useT } from './lib/idioma';

const OPCIONES: { valor: Tema; label: string; icono: string }[] = [
  { valor: 'light', label: 'Claro', icono: 'sol' },
  { valor: 'dark', label: 'Oscuro', icono: 'luna' },
  { valor: 'qovento', label: 'Qovento', icono: 'diamante' },
];

export default function ThemeToggle() {
  const t = useT();
  const [tema, setTemaState] = useState<Tema>('light');

  useEffect(() => {
    setTemaState(getTema());
  }, []);

  const elegir = (nuevoTema: Tema) => {
    setTema(nuevoTema);
    setTemaState(nuevoTema);
  };

  return (
    <QCard padding="lg" className="flex flex-col gap-3">
      <div>
        <p className="text-base font-medium text-ink dark:text-dark-text">{t('Apariencia')}</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Elegí cómo se ve la app')}</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Apariencia')}>
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            onClick={() => elegir(o.valor)}
            role="radio"
            aria-checked={tema === o.valor}
            className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 transition-colors duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent ${
              tema === o.valor
                ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                : 'border-border dark:border-dark-border hover:border-accent/40 dark:hover:border-dark-accent/40'
            }`}
          >
            <span aria-hidden="true" className={tema === o.valor ? 'text-accent dark:text-dark-accent' : 'text-muted dark:text-dark-text-secondary'}>
              {ICONOS[o.icono]}
            </span>
            <span className="text-sm font-medium text-ink dark:text-dark-text">{t(o.label)}</span>
          </button>
        ))}
      </div>
      {tema === 'qovento' && (
        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Modo Qovento: fondo azulado de la marca en toda la app.')}</p>
      )}
    </QCard>
  );
}
