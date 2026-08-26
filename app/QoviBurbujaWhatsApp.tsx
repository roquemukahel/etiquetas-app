'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';

const KEY_CERRADA = 'qovento:qovi-burbuja-whatsapp-cerrada';
const LINK_CANAL = 'https://whatsapp.com/channel/0029VbD94Sf1iUxa3EnkSr1p';

// Punto de la boca de Qovi, en % del ancho/alto de la imagen — mismo
// criterio y misma fuente que OJOS en QoviLateral.tsx (medido sobre los
// píxeles de la imagen original, 1116×1409): un poco por debajo y entre
// las dos pupilas (ojoIzq/ojoDer están a top 28–34%, left 40–55.7%).
const BOCA = { left: 47, top: 43 };

// Viñeta de conversación junto a Qovi (QoviLateral, que se asoma por el
// borde izquierdo de la tarjeta de Resumen financiero) invitando a sumarse
// al canal de difusión de WhatsApp del dueño de Qovento.
//
// Comparte el MISMO cuadro de posicionamiento que QoviLateral (hidden
// lg:block absolute right-full top-1/2 -translate-y-1/2 translate-x-[18%]
// w-36 xl:w-44) — así la burbuja queda anclada exactamente sobre la boca
// de la imagen (BOCA, en % de ese cuadro) sin importar el tamaño real del
// PNG, y crece hacia arriba-izquierda para no taparle la cara ni el
// cuerpo. Vive AFUERA del <Link> de la tarjeta (que es clickeable entera
// hacia /estadísticas) — si estuviera adentro, tocar el link de WhatsApp o
// la X terminaría navegando a Estadísticas en vez de hacer lo que dice el
// botón. Por eso en app/page.tsx se renderiza como hermano del Link,
// dentro del mismo contenedor position:relative.
//
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
    <div
      aria-hidden={false}
      className="hidden lg:block pointer-events-none absolute right-full top-1/2 -translate-y-1/2 translate-x-[18%] w-36 xl:w-44 z-30"
    >
      <div
        className="absolute pointer-events-auto w-56 animate-fade-in-up"
        style={{ left: `${BOCA.left}%`, top: `${BOCA.top}%`, transform: 'translate(-100%, -100%)' }}
      >
        <div className="relative rounded-2xl bg-white dark:bg-dark-surface text-ink dark:text-dark-text shadow-elevated border border-border dark:border-dark-border px-3.5 py-3 mb-1.5 mr-1">
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
          {/* Punta delgada saliendo de la boca de Qovi: el borde inferior
              derecho de la burbuja ya cae justo sobre BOCA (por el
              translate(-100%,-100%) de arriba), así que este triángulo
              angosto solo tiene que apuntar derecho hacia abajo desde esa
              misma esquina para "salir de la boca". */}
          <span
            className="absolute block border-l-transparent border-r-transparent border-t-white dark:border-t-dark-surface"
            style={{
              right: '10px',
              bottom: '-14px',
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '14px 5px 0 5px',
            }}
          />
        </div>
      </div>
    </div>
  );
}
