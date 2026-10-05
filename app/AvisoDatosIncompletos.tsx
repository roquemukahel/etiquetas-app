'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';
import { EVENTO_DATOS_INCOMPLETOS } from './lib/db';

// obtenerTodasLasFilas (app/lib/db.ts) reintenta cada página y, si igual no
// pudo traerla, devuelve lo que tiene en vez de colgar la pantalla. Eso estaba
// bien para que la pantalla no se rompa, pero dejaba números incompletos
// (totales, listas, saldos) sin que nadie se enterara. Este aviso lo dice.
export default function AvisoDatosIncompletos() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mostrar = () => setVisible(true);
    window.addEventListener(EVENTO_DATOS_INCOMPLETOS, mostrar);
    return () => window.removeEventListener(EVENTO_DATOS_INCOMPLETOS, mostrar);
  }, []);

  if (!visible) return null;
  return (
    <div
      role="alert"
      className="no-print fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-warn/40 bg-white px-4 py-3 text-sm shadow-lg dark:bg-dark-surface"
    >
      <span className="flex-1">
        ⚠ {t('No se pudieron cargar todos los datos de esta pantalla: los números pueden estar incompletos.')}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white dark:bg-dark-accent"
      >
        {t('Recargar')}
      </button>
      <button type="button" onClick={() => setVisible(false)} aria-label={t('Cerrar')} className="shrink-0 text-muted">
        ✕
      </button>
    </div>
  );
}
