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
    // Sin chequeo de NODE_ENV: next-pwa ya decide si genera /sw.js o no
    // (lo desactiva en desarrollo vía su propia opción `disable`) — si el
    // archivo no existe (dev local), el registro simplemente falla solo,
    // sin romper nada (.catch). Agregar una segunda condición acá encima
    // era redundante y, en la práctica, terminó bloqueando el registro en
    // producción real (ver comentario de arriba).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
