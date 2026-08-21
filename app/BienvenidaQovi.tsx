'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';

// A pedido del usuario, el saludo aparece SIEMPRE al entrar/actualizar el
// Inicio, 30 s después de cargar (no "una sola vez"). Si más adelante querés que
// aparezca solo una vez o una vez por día, se cambia acá la lógica del delay.
const DEMORA_MS = 30000;

export default function BienvenidaQovi() {
  const [visible, setVisible] = useState(false);
  const t = useT();

  useEffect(() => {
    // Modo prueba: qovento.app/?qovi=1 lo hace salir rápido (para revisarlo sin
    // esperar los 30 s).
    let forzar = false;
    try {
      forzar = new URLSearchParams(window.location.search).get('qovi') === '1';
    } catch {}

    const t = setTimeout(() => setVisible(true), forzar ? 800 : DEMORA_MS);
    return () => clearTimeout(t);
  }, []);

  const cerrar = () => setVisible(false);

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
      className="qv-saludo-overlay fixed inset-0 z-[60] bg-ink/40 dark:bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qovi-titulo"
      onClick={cerrar}
    >
      {/* Qovi + globo, anclados abajo a la izquierda: sale del menú lateral
         (en desktop arranca a la altura del sidebar; en celular, del borde). */}
      <div
        className="absolute bottom-3 left-1 sm:left-3 lg:left-[256px] flex items-end max-w-[calc(100%-0.5rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qovi-saludo.webp"
          alt="Qovi, la mascota de Qovento, saludando"
          className="qv-saludo-robot pointer-events-none relative z-[2] w-24 sm:w-28 lg:w-36 shrink-0 object-contain drop-shadow-2xl"
        />

        {/* Viñeta / globo de diálogo, con colita apuntando a Qovi */}
        <div className="qv-saludo-bubble relative z-[1] -ml-4 mb-6 sm:mb-10 w-[248px] sm:w-[300px] rounded-3xl rounded-bl-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated p-4 pt-4">
          {/* Colita del globo (apunta a la izquierda, hacia Qovi) */}
          <span className="absolute -left-1.5 top-9 h-4 w-4 rotate-45 bg-white dark:bg-dark-surface border-l border-b border-border dark:border-dark-border" />

          <button
            onClick={cerrar}
            aria-label={t('Cerrar')}
            className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg transition-colors text-sm"
          >
            ✕
          </button>

          <h2 id="qovi-titulo" className="text-lg font-display font-semibold tracking-tight pr-6">
            {t('¡Hola! Soy Qovi')} <span className="qv-saludo-mano inline-block">👋</span>
          </h2>

          <div className="mt-1.5 flex flex-col gap-1.5 text-[13px] text-ink/90 dark:text-dark-text leading-snug">
            <p>{t('Hicimos una puesta a punto: corregimos errores y mejoramos la estabilidad del sistema.')}</p>
            <p>{t('Seguimos trabajando en cada detalle para que tu negocio avance sin límites.')}</p>
            <p className="font-medium">{t('¡Gracias por confiar en nosotros! Que tengas una jornada increíble.')}</p>
          </div>

          <p className="mt-2 text-[11px] text-muted dark:text-dark-text-secondary">
            {t('Esto recién empieza — Qovento sigue creciendo. 🚀')}
          </p>

          <button
            onClick={cerrar}
            className="mt-3 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-center text-sm font-medium text-white"
          >
            {t('¡Gracias, Qovi!')}
          </button>
        </div>
      </div>

      <style>{`
        .qv-saludo-overlay { animation: qvSaludoFade 0.25s ease-out; }
        /* Qovi entra desde la izquierda (como saliendo del menú lateral) y saluda */
        .qv-saludo-robot {
          transform-origin: bottom center;
          animation: qvSaludoEntra 0.6s cubic-bezier(0.16, 1, 0.3, 1) both,
                     qvSaludoSalu 1.5s ease-in-out 0.65s 3;
        }
        .qv-saludo-bubble { animation: qvSaludoGlobo 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both; transform-origin: left center; }
        @keyframes qvSaludoFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qvSaludoEntra { from { opacity: 0; transform: translateX(-80px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes qvSaludoGlobo { from { opacity: 0; transform: scale(0.85) translateX(-10px); } to { opacity: 1; transform: scale(1) translateX(0); } }
        @keyframes qvSaludoSalu { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
        .qv-saludo-mano { animation: qvSaludoMano 1.5s ease-in-out 0.65s 3; transform-origin: 70% 80%; }
        @keyframes qvSaludoMano { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(18deg); } 75% { transform: rotate(-12deg); } }
        @media (prefers-reduced-motion: reduce) {
          .qv-saludo-overlay, .qv-saludo-robot, .qv-saludo-bubble, .qv-saludo-mano { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
