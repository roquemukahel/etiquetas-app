'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';

const KEY_CERRADA = 'qovento:qovi-burbuja-whatsapp-cerrada';
const LINK_CANAL = 'https://whatsapp.com/channel/0029VbD94Sf1iUxa3EnkSr1p';

// Punto de la boca de Qovi, en % del ancho/alto de la imagen — medido
// directamente sobre los píxeles del PNG original (1116×1409, recortando
// con sharp la zona de la cara): la sonrisa (puntitos celestes) va de
// (513,563) a (620,305)px aprox.; se toma la esquina más cercana al lado
// por donde llega la burbuja (izquierda) como punto de anclaje.
const BOCA = { left: 46, top: 40 };

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
      // aspect-[1116/1409]: MISMA proporción que la imagen de QoviLateral.
      // Sin esto, este div queda con alto 0 (su único contenido es
      // "position: absolute", que no aporta altura al padre) y entonces
      // top/left en % de BOCA se calculan sobre una caja de 0px de alto —
      // por eso la primera versión terminó apuntando a cualquier lado
      // menos a la boca real de Qovi.
      className="hidden lg:block pointer-events-none absolute right-full top-1/2 -translate-y-1/2 translate-x-[18%] w-36 xl:w-44 aspect-[1116/1409] z-30"
    >
      {/* left/top posicionan la ESQUINA del div en BOCA, pero el transform
          real que la corre a su lugar (translate -100%,-50%: borde derecho
          en BOCA, centrada verticalmente en la boca) NO puede ir en este
          mismo div si también lleva animate-fade-in-up — esa clase anima
          "transform" vía @keyframes con animation-fill-mode:both, y el
          valor final de la animación (translateY(0)) GANA para siempre por
          sobre el transform inline de acá, dejando el div sin mover de
          BOCA. Por eso la animación de entrada vive en el div de ADENTRO
          (el que solo tiene su propio transform de layout, ninguno de
          posicionamiento) y este de acá se queda solo con el transform. */}
      <div
        className="absolute pointer-events-auto w-56"
        style={{ left: `${BOCA.left}%`, top: `${BOCA.top}%`, transform: 'translate(-100%, -50%)' }}
      >
        <div className="relative rounded-2xl bg-white dark:bg-dark-surface text-ink dark:text-dark-text shadow-elevated border border-border dark:border-dark-border px-3.5 py-3 mr-1 animate-fade-in-up">
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
          {/* Punta apuntando a la derecha, hacia la boca — el div padre ya
              queda con el borde derecho pegado a BOCA (translate -100% en
              X), así que esta punta solo tiene que salir de la mitad
              derecha de la burbuja apuntando horizontal hacia esa boca. */}
          <span
            className="absolute block border-t-transparent border-b-transparent border-l-white dark:border-l-dark-surface"
            style={{
              right: '-14px',
              top: '50%',
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '5px 0 5px 14px',
              transform: 'translateY(-50%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
