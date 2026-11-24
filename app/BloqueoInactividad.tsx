'use client';

import { useEffect, useState } from 'react';
import { QCard } from './QCard';
import { useT } from './lib/idioma';
import { useActor } from './lib/actor';
import { tienePermiso } from './lib/permisos';
import { guardarMinutosDeBloqueo, leerMinutosDeBloqueo, MINUTOS_BLOQUEO_POR_DEFECTO, OPCIONES_BLOQUEO } from './lib/inactividad';

// Configuración > "Bloqueo por inactividad": a los cuántos minutos sin usar el sistema se vuelve a pedir quién trabaja.
// Es una preferencia de ESTE equipo (la PC del mostrador, por ejemplo), igual que el tema de apariencia.
export default function BloqueoInactividad() {
  const t = useT();
  const actor = useActor();
  const [minutos, setMinutos] = useState(MINUTOS_BLOQUEO_POR_DEFECTO);
  useEffect(() => setMinutos(leerMinutosDeBloqueo()), []);

  // Que cualquiera pueda poner "Nunca" desharía el sentido del bloqueo: solo lo cambia un administrador.
  const puedeCambiar = tienePermiso(actor, 'gestionar_usuarios');

  const elegir = (nuevo: number) => {
    guardarMinutosDeBloqueo(nuevo);
    setMinutos(nuevo);
  };

  return (
    <QCard padding="lg" className="flex flex-col gap-3">
      <div>
        <p className="text-base font-medium text-ink dark:text-dark-text">{t('Bloqueo por inactividad')}</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Si nadie usa el sistema en este equipo durante este tiempo, vuelve a pedir quién está trabajando (y su PIN, si tiene).')}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="radiogroup" aria-label={t('Bloqueo por inactividad')}>
        {OPCIONES_BLOQUEO.map((o) => (
          <button
            key={o.minutos}
            onClick={() => elegir(o.minutos)}
            disabled={!puedeCambiar}
            role="radio"
            aria-checked={minutos === o.minutos}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-200 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent ${
              minutos === o.minutos
                ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft text-ink dark:text-dark-text'
                : 'border-border dark:border-dark-border text-ink dark:text-dark-text hover:border-accent/40 dark:hover:border-dark-accent/40'
            }`}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {puedeCambiar ? t('Se guarda en este equipo.') : t('Solo un administrador puede cambiar esto.')}
      </p>
    </QCard>
  );
}
