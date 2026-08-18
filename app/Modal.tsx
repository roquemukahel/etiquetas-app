'use client';

import { useEffect, useRef } from 'react';

// Modal/drawer genérico — mismo patrón visual que ya usaban a mano
// clientes/[id] y otras páginas (overlay + tarjeta centrada), ahora en un
// solo componente para no rehacerlo en cada pantalla nueva (Servicios,
// Repuestos, y lo que siga necesitando un formulario en modal).
export default function Modal({
  titulo,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Foco al abrir y cierre con Escape — accesibilidad básica de modal
  // (sección 27 del rediseño de Servicio Técnico).
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} my-auto bg-white dark:bg-dark-surface rounded-2xl shadow-elevated p-5 flex flex-col gap-3 outline-none max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold">{titulo}</p>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 text-xl leading-none text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text px-1"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
