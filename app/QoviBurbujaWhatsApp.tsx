'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';

const KEY_CERRADA = 'qovento:qovi-burbuja-whatsapp-cerrada';
const LINK_CANAL = 'https://whatsapp.com/channel/0029VbD94Sf1iUxa3EnkSr1p';

// Viñeta de conversación junto a Qovi (QoviLateral, que se asoma por el
// borde izquierdo de la tarjeta de Resumen financiero) invitando a sumarse
// al canal de difusión de WhatsApp del dueño de Qovento. Vive AFUERA del
// <Link> de esa tarjeta (que es clickeable entera hacia /estadisticas) —
// si estuviera adentro, tocar el link de WhatsApp o la X terminaría
// navegando a Estadísticas en vez de hacer lo que dice el botón. Por eso
// en app/page.tsx se renderiza como hermano del Link, dentro del mismo
// contenedor position:relative.
// Empieza oculta y solo se muestra tras confirmar en localStorage que
// nadie la cerró antes — evita el parpadeo de "aparece y después
// desaparece" en el primer render del lado del servidor, que no tiene
// acceso a localStorage.
export default function QoviBurbujaWhatsApp() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY_CERRADA)) setVisible(true);
    } catch {}
  }, []);

  if (!visible) return null;

  const cerrar = () => {
    setVisible(false);
    try {
      localStorage.setItem(KEY_CERRADA, '1');
    } catch {}
  };

  return (
    <div className="hidden lg:block absolute right-full bottom-[62%] mb-3 mr-1 w-52 z-30 animate-fade-in-up">
      <div className="relative rounded-2xl rounded-bl-sm bg-white dark:bg-dark-surface text-ink dark:text-dark-text shadow-elevated border border-border dark:border-dark-border px-3.5 py-3">
        <button
          onClick={cerrar}
          aria-label={t('Cerrar')}
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-ink dark:bg-dark-bg text-white flex items-center justify-center text-xs leading-none hover:opacity-80"
        >
          ×
        </button>
        <p className="text-xs leading-snug">
          {t('¡Sumate a nuestro canal de WhatsApp! Ahí compartimos noticias y novedades de Qovento.')}
        </p>
        <a
          href={LINK_CANAL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-good hover:opacity-80"
        >
          {t('Unirme al canal')} →
        </a>
      </div>
    </div>
  );
}
