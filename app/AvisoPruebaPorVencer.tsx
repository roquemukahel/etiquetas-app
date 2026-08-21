'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from './lib/idioma';

// Cartel de aviso cuando quedan 1 o 2 días de prueba — para que no agarre
// de sorpresa y puedan pagar con anticipación en vez de dejarlo para el
// último momento. Se puede cerrar (dura lo que dura la sesión del
// navegador: vuelve a aparecer la próxima vez que entren, que es
// justamente el recordatorio que se busca mientras la prueba sigue por
// vencer).
export default function AvisoPruebaPorVencer({ diasDePrueba }: { diasDePrueba: number | null }) {
  const [cerrado, setCerrado] = useState(false);
  const t = useT();

  if (cerrado || diasDePrueba == null || (diasDePrueba !== 1 && diasDePrueba !== 2)) return null;

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 flex items-center gap-3 animate-fade-in-up">
      <span className="text-xl shrink-0">⏳</span>
      <p className="flex-1 text-sm">
        {diasDePrueba === 1 ? (
          <>
            {t('Tu prueba gratis vence')} <strong>{t('mañana')}</strong>.
          </>
        ) : (
          <>
            {t('Tu prueba gratis vence en')} <strong>{t('2 días')}</strong>.
          </>
        )}{' '}
        {t('Activá tu suscripción con tiempo para no quedarte sin acceso.')}
      </p>
      <Link
        href="/configuracion/suscripcion"
        className="shrink-0 rounded-lg bg-warn text-white px-3 py-1.5 text-xs font-medium whitespace-nowrap"
      >
        {t('Activar ahora')}
      </Link>
      <button
        onClick={() => setCerrado(true)}
        aria-label={t('Cerrar aviso')}
        className="shrink-0 text-muted dark:text-dark-text-secondary text-lg leading-none px-1"
      >
        &times;
      </button>
    </div>
  );
}
