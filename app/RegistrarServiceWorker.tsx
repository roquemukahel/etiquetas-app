'use client';

import { useEffect } from 'react';

// next-pwa (v5.6, ver next.config.js) genera /sw.js bien, pero su
// registro automático inyecta un script en _document.js — algo que ya no
// existe con el App Router (app/layout.tsx lo reemplaza). Resultado real:
// el service worker se construía y se servía, pero NUNCA se registraba en
// el navegador, así que la app en realidad no era instalable como PWA de
// escritorio pese a tener manifest.json y sw.js. Se registra a mano acá.
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
