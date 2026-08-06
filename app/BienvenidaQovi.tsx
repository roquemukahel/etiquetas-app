'use client';

import { useEffect, useState } from 'react';

// Se muestra UNA sola vez por dispositivo (localStorage). Para volver a mostrarlo
// a todos en el futuro (otro anuncio), cambiar esta clave por una nueva versión.
const CLAVE = 'qovento:saludo-qovi-2026-08';

export default function BienvenidaQovi() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) !== '1') {
        // Pequeño delay para que el inicio ya esté pintado y la entrada se note.
        const t = setTimeout(() => setVisible(true), 500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE, '1');
    } catch {}
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="qv-saludo-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/50 dark:bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qovi-titulo"
      onClick={cerrar}
    >
      <div
        className="qv-saludo-card relative w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banda superior de marca */}
        <div className="h-2 w-full bg-gradient-to-r from-accent to-accent-hover dark:from-dark-accent dark:to-dark-accent-hover" />

        <button
          onClick={cerrar}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-canvas/80 dark:bg-dark-bg/80 text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors"
        >
          ✕
        </button>

        {/* Qovi asomándose desde la izquierda, saludando */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qovi-saludo.webp"
          alt="Qovi, la mascota de Qovento, saludando"
          className="qv-saludo-robot pointer-events-none absolute bottom-0 left-0 z-[1] w-24 sm:w-32 object-contain drop-shadow-xl"
        />

        <div className="relative z-[2] py-6 pr-6 pl-[104px] sm:pl-40">
          <h2 id="qovi-titulo" className="text-xl font-display font-semibold tracking-tight">
            ¡Hola! Soy Qovi <span className="qv-saludo-mano inline-block">👋</span>
          </h2>

          <div className="mt-2 flex flex-col gap-2 text-sm text-ink/90 dark:text-dark-text leading-snug">
            <p>Hicimos una puesta a punto: corregimos errores y mejoramos la estabilidad del sistema.</p>
            <p>Seguimos trabajando en cada detalle para que tu negocio avance sin límites.</p>
            <p className="font-medium">¡Gracias por confiar en nosotros! Que tengas una jornada increíble.</p>
          </div>

          <p className="mt-3 text-[11px] text-muted dark:text-dark-text-secondary">
            Esto recién empieza — Qovento sigue creciendo. 🚀
          </p>

          <button
            onClick={cerrar}
            className="mt-4 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-center text-sm font-medium text-white"
          >
            ¡Gracias, Qovi!
          </button>
        </div>
      </div>

      <style>{`
        .qv-saludo-overlay { animation: qvSaludoFade 0.25s ease-out; }
        .qv-saludo-card { animation: qvSaludoPop 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        /* Qovi entra desde la izquierda (como saliendo del menú lateral) y saluda */
        .qv-saludo-robot {
          transform-origin: bottom center;
          animation: qvSaludoEntra 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
                     qvSaludoSalu 1.5s ease-in-out 0.6s 3;
        }
        @keyframes qvSaludoFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qvSaludoPop { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes qvSaludoEntra { from { opacity: 0; transform: translateX(-60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes qvSaludoSalu { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
        .qv-saludo-mano { animation: qvSaludoMano 1.5s ease-in-out 0.6s 3; transform-origin: 70% 80%; }
        @keyframes qvSaludoMano { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(18deg); } 75% { transform: rotate(-12deg); } }
        @media (prefers-reduced-motion: reduce) {
          .qv-saludo-overlay, .qv-saludo-card, .qv-saludo-robot, .qv-saludo-mano { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
