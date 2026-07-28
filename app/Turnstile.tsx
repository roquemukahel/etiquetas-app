'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
      remove: (widgetId?: string) => void;
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
        });
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existente = document.querySelector('script[data-turnstile]');
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
