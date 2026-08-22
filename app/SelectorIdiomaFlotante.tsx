'use client';

import { useEffect, useRef, useState } from 'react';
import { useIdioma, setIdioma, useT, IDIOMAS_DISPONIBLES, type Idioma } from './lib/idioma';

// Login/Registro excluyen la barra "Trabajando como..." (donde vive el
// selector de idioma normal — ver SelectorDeActor.tsx) porque todavía no hay
// nadie logueado. Sin este botón, una persona de habla portuguesa/inglesa
// que entra por primera vez no tendría forma de cambiar el idioma antes de
// crear su cuenta.
export default function SelectorIdiomaFlotante() {
  const idioma = useIdioma();
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const elegir = (valor: Idioma) => {
    setIdioma(valor);
    setAbierto(false);
  };

  return (
    <div ref={ref} className="fixed top-3 right-3 z-40">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={t('Cambiar idioma')}
        className="flex items-center gap-1 rounded-full border border-white/30 bg-ink/70 text-white text-xs font-medium px-2.5 py-1 backdrop-blur-sm hover:bg-ink/90 transition-colors"
      >
        {IDIOMAS_DISPONIBLES.find((i) => i.valor === idioma)?.etiqueta ?? idioma}
        <span className="text-[8px]">▾</span>
      </button>
      {abierto && (
        <div className="absolute right-0 top-full mt-1 min-w-[110px] rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1">
          {IDIOMAS_DISPONIBLES.map((i) => (
            <button
              key={i.valor}
              type="button"
              onClick={() => elegir(i.valor)}
              className={`block w-full text-left px-3 py-1.5 text-sm text-ink dark:text-dark-text hover:bg-canvas dark:hover:bg-dark-bg ${
                i.valor === idioma ? 'font-medium text-accent dark:text-dark-accent' : ''
              }`}
            >
              {i.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
