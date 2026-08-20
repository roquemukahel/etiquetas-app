'use client';

import { QOVI_ASSETS, QoviEscena } from './lib/qoviAssets';

// Componente compartido para los 4 estados ilustrados de Qovi (stock
// vacío, reparación demorada, estadísticas positivas, sin resultados).
// Un solo lugar que decide CÓMO se ve Qovi en cualquier pantalla — cada
// pantalla solo decide CUÁNDO mostrarlo (la condición real, ver los
// comentarios en app/lib/qoviAssets.ts). Qovi nunca debería aparecer más
// de una vez en una misma pantalla visible.
export type QoviAccion = { label: string; onClick?: () => void; href?: string; disabled?: boolean };
export type QoviTamano = 'sm' | 'md' | 'lg';
export type QoviAlineacion = 'centro' | 'izquierda';

const TAMANOS: Record<QoviTamano, string> = {
  // Todas dejan un poco más chico en mobile que en escritorio, como pide
  // el diseño (ej. stock vacío: 170–230px mobile, 240–320px escritorio).
  sm: 'w-40 sm:w-48',
  md: 'w-44 sm:w-56 md:w-64',
  lg: 'w-52 sm:w-64 md:w-72',
};

export function QoviState({
  escena,
  titulo,
  descripcion,
  accionPrimaria,
  accionSecundaria,
  tamano = 'md',
  alineacion = 'centro',
  claseAdicional = '',
  altImagen = '',
}: {
  escena: QoviEscena;
  titulo: string;
  descripcion?: string;
  accionPrimaria?: QoviAccion;
  accionSecundaria?: QoviAccion;
  tamano?: QoviTamano;
  alineacion?: QoviAlineacion;
  claseAdicional?: string;
  /** Vacío por defecto (decorativa): el título y la descripción ya cuentan la escena. Pasar texto solo si la imagen aporta algo que el texto no dice. */
  altImagen?: string;
}) {
  const esLateral = alineacion === 'izquierda';

  const Boton = ({ accion, variante }: { accion: QoviAccion; variante: 'primaria' | 'secundaria' }) => {
    const clases =
      variante === 'primaria'
        ? 'bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover text-white'
        : 'border border-border dark:border-dark-border hover:bg-canvas dark:hover:bg-dark-bg';
    const Etiqueta = accion.href ? 'a' : 'button';
    return (
      <Etiqueta
        {...(accion.href ? { href: accion.href } : { type: 'button' as const, onClick: accion.onClick, disabled: accion.disabled })}
        className={`inline-flex items-center justify-center rounded-xl px-4 h-10 text-sm font-medium transition-colors disabled:opacity-40 ${clases}`}
      >
        {accion.label}
      </Etiqueta>
    );
  };

  return (
    <div
      className={`flex gap-5 py-8 px-4 animate-fade-in-up ${
        esLateral ? 'flex-col sm:flex-row sm:items-center' : 'flex-col items-center text-center'
      } ${claseAdicional}`}
    >
      <div className={`shrink-0 ${TAMANOS[tamano]} ${esLateral ? 'mx-auto sm:mx-0' : 'mx-auto'}`} style={{ aspectRatio: '1 / 1' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={QOVI_ASSETS[escena]}
          alt={altImagen}
          loading="lazy"
          decoding="async"
          width={320}
          height={320}
          className="h-full w-full object-contain drop-shadow-[0_8px_16px_rgba(15,23,42,0.10)] dark:drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
        />
      </div>
      <div className={`flex flex-col gap-1.5 ${esLateral ? 'items-center sm:items-start text-center sm:text-left' : 'items-center'}`}>
        <p className="text-base font-display font-semibold">{titulo}</p>
        {descripcion && <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">{descripcion}</p>}
        {(accionPrimaria || accionSecundaria) && (
          <div className="flex flex-wrap items-center gap-2 mt-1.5 justify-center sm:justify-start">
            {accionPrimaria && <Boton accion={accionPrimaria} variante="primaria" />}
            {accionSecundaria && <Boton accion={accionSecundaria} variante="secundaria" />}
          </div>
        )}
      </div>
    </div>
  );
}
