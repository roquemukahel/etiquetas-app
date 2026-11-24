'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';

// next-pwa (v5.6, ver next.config.js) genera /sw.js bien, pero su
// registro automático inyecta un script en _document.js — algo que ya no
// existe con el App Router (app/layout.tsx lo reemplaza). Resultado real:
// el service worker se construía y se servía, pero NUNCA se registraba en
// el navegador, así que la app en realidad no era instalable como PWA de
// escritorio pese a tener manifest.json y sw.js. Se registra a mano acá.
//
// Además avisa cuando hay una versión nueva: Qovento es una app de una sola página, así que una pestaña (o la
// app instalada) que se deja abierta todo el día sigue corriendo el código VIEJO hasta que alguien la recarga —
// por eso un cambio ya publicado "no aparecía" en el local. Se busca una versión nueva al volver a la pestaña y
// cada 10 minutos, y si hay una se muestra un aviso con el botón para actualizar (no se recarga sola, para no
// cortar a alguien que está cargando algo).
export default function RegistrarServiceWorker() {
  const t = useT();
  const [hayVersionNueva, setHayVersionNueva] = useState(false);

  useEffect(() => {
    // Sin chequeo de NODE_ENV: next-pwa ya decide si genera /sw.js o no
    // (lo desactiva en desarrollo vía su propia opción `disable`) — si el
    // archivo no existe (dev local), el registro simplemente falla solo,
    // sin romper nada (.catch). Agregar una segunda condición acá encima
    // era redundante y, en la práctica, terminó bloqueando el registro en
    // producción real (ver comentario de arriba).
    if (!('serviceWorker' in navigator)) return;

    // Si ya había un service worker controlando esta pestaña, un cambio de controlador significa que se
    // publicó una versión nueva (la primera instalación no cuenta).
    const habiaControlador = !!navigator.serviceWorker.controller;
    const alCambiarControlador = () => {
      if (habiaControlador) setHayVersionNueva(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', alCambiarControlador);

    let registro: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register('/sw.js')
      .then((r) => {
        registro = r;
      })
      .catch(() => {});

    const buscarVersionNueva = () => {
      registro?.update().catch(() => {});
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') buscarVersionNueva();
    };
    document.addEventListener('visibilitychange', alVolver);
    const intervalo = window.setInterval(buscarVersionNueva, 10 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiarControlador);
      document.removeEventListener('visibilitychange', alVolver);
      window.clearInterval(intervalo);
    };
  }, []);

  if (!hayVersionNueva) return null;
  return (
    <div
      role="status"
      className="no-print fixed bottom-4 left-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-accent/40 bg-white px-4 py-3 text-sm shadow-lg dark:bg-dark-surface"
    >
      <span className="flex-1">{t('Hay una versión nueva de Qovento. Actualizá para ver los últimos cambios.')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white dark:bg-dark-accent"
      >
        {t('Actualizar')}
      </button>
    </div>
  );
}
