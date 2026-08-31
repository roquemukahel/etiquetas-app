'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      remove: (widgetId?: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;

    const renderWidget = () => {
      if (ref.current && window.turnstile && !widgetId.current) {
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY!,
          callback: onVerify,
          // El token de Turnstile vence solo a los pocos minutos. Si la
          // persona tarda en completar el formulario, el widget lo marca
          // como vencido en silencio: sin esto, el botón seguía habilitado
          // con un token ya vencido y el envío fallaba con un error de
          // captcha que la pantalla de login/registro mostraba como
          // "contraseña incorrecta" (mensaje engañoso, ver ese archivo).
          // Acá se limpia el token y se pide uno nuevo automáticamente.
          'expired-callback': () => {
            onVerify('');
            if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
          },
          'error-callback': () => {
            onVerify('');
          },
        });
      }
    };

    let existente: Element | null = null;

    if (window.turnstile) {
      renderWidget();
    } else {
      existente = document.querySelector('script[data-turnstile]');
      if (!existente) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-turnstile', 'true');
        script.onload = renderWidget;
        document.body.appendChild(script);
      } else {
        existente.addEventListener('load', renderWidget);
      }
    }

    return () => {
      // Si el script ya existía pero todavía no había cargado y esta
      // pantalla se desmonta antes de que termine (ej. se navegó afuera de
      // Login/Registro), sin esto el listener quedaba vivo e intentaba
      // renderizar el widget sobre un componente ya desmontado.
      existente?.removeEventListener('load', renderWidget);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={ref} className="flex justify-center" />;
}
