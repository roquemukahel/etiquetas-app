'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';
import { IconoBase } from './Iconos';

// Cartel de "novedades del sistema" — aparece una vez por dispositivo al
// entrar a Inicio (no una vez por usuario: es lo mismo que ya se usa para
// el aviso de prueba por vencer y el saludo de Qovi, vía localStorage). Para
// anunciar la PRÓXIMA tanda de cambios, no reescribas este archivo: cambiá
// la fecha en CLAVE_VISTA (ej. 'qovento:novedades-2026-10') y reemplazá
// ITEMS de más abajo — al ser una clave nueva, todos la vuelven a ver.
const CLAVE_VISTA = 'qovento:novedades-2026-09';

type Item = { titulo: string; descripcion: string; donde: string; icono: React.ReactNode };

function useItems(t: (s: string) => string): Item[] {
  return [
    {
      titulo: t('Motorola ya está en el catálogo'),
      descripcion: t('Se suma a iPhone, Samsung y Xiaomi: al cargar stock aparecen fotos reales de cada color.'),
      donde: t('Configuración → Datos del negocio'),
      icono: (
        <IconoBase size={20}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
          <circle cx="9.3" cy="18.2" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18.2" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14.7" cy="18.2" r="0.9" fill="currentColor" stroke="none" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Excel para importar y exportar'),
      descripcion: t('Antes solo se podía en CSV. Ahora también en Excel (.xlsx), directo.'),
      donde: t('Clientes · Stock · Productos'),
      icono: (
        <IconoBase size={20}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M9 9v11" />
          <path d="M13 13.5l2.2 2.2L19 12" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Imprimir etiquetas directo'),
      descripcion: t('Ya no hace falta guardar la imagen para poder imprimirla: hay un botón "Imprimir".'),
      donde: t('Stock → Etiqueta'),
      icono: (
        <IconoBase size={20}>
          <path d="M6 9V3h12v6" />
          <rect x="3" y="9" width="18" height="8" rx="1.6" />
          <rect x="7" y="14.5" width="10" height="6.5" rx="1" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Elegís qué tipo de equipo entra'),
      descripcion: t('Celular, notebook, tablet o parlante — cada uno con su propio checklist de ingreso.'),
      donde: t('Servicio Técnico → Recibir equipo'),
      icono: (
        <IconoBase size={20}>
          <rect x="2.5" y="6" width="7" height="12" rx="1.4" />
          <rect x="13" y="3.5" width="8.5" height="9" rx="1" />
          <path d="M14 17.5h6.5M17.3 17.5v3" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Bloqueo del equipo al recibirlo'),
      descripcion: t('PIN, contraseña o patrón (se dibuja en una grilla). Queda guardado y sale en la boleta.'),
      donde: t('Servicio Técnico → Recibir equipo'),
      icono: (
        <IconoBase size={20}>
          <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" opacity=".35" />
          <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" opacity=".35" />
          <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" opacity=".35" />
          <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" opacity=".35" />
          <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="17" r="1" fill="currentColor" stroke="none" />
          <path d="M7 7L7 12L7 17L12 17L17 17" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Repuestos separados por sucursal'),
      descripcion: t('Si tenés más de un local, cargás stock de repuestos distinto para cada uno.'),
      donde: t('Servicio Técnico → Repuestos'),
      icono: (
        <IconoBase size={20}>
          <path d="M12 2.5c-3 0-5.4 2.2-5.4 5.4C6.6 12 12 21.5 12 21.5S17.4 12 17.4 7.9c0-3.2-2.4-5.4-5.4-5.4z" />
          <circle cx="12" cy="8" r="2.1" />
        </IconoBase>
      ),
    },
    {
      titulo: t('Botón "Imprimir boleta" en la reparación'),
      descripcion: t('Ya no hace falta ir a buscar la orden de cobro: está al lado de "Imprimir etiqueta".'),
      donde: t('Ficha de la reparación'),
      icono: (
        <IconoBase size={20}>
          <path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
          <path d="M8.5 11h7M8.5 14.3h7M8.5 17.6h4.2" />
        </IconoBase>
      ),
    },
    {
      titulo: t('El selector Minorista/Mayorista es opcional'),
      descripcion: t('Si no lo usás, lo apagás desde Configuración y no vuelve a aparecer al cargar una venta.'),
      donde: t('Configuración → Comisiones'),
      icono: (
        <IconoBase size={20}>
          <rect x="3" y="8" width="18" height="8" rx="4" />
          <circle cx="8" cy="12" r="2.3" fill="currentColor" stroke="none" />
        </IconoBase>
      ),
    },
  ];
}

export default function NovedadesModal() {
  const [visible, setVisible] = useState(false);
  const t = useT();
  const items = useItems(t);

  useEffect(() => {
    let yaVista = true;
    try {
      yaVista = localStorage.getItem(CLAVE_VISTA) === '1';
    } catch {}
    if (yaVista) return;
    const id = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(id);
  }, []);

  const cerrar = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_VISTA, '1');
    } catch {}
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="nv-overlay fixed inset-0 z-[70] bg-ink/40 dark:bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="novedades-titulo"
      onClick={cerrar}
    >
      <div
        className="nv-card relative w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-border dark:border-dark-border shrink-0">
          <button
            onClick={cerrar}
            aria-label={t('Cerrar')}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
          >
            ✕
          </button>
          <span className="inline-block text-[11px] font-bold tracking-wide uppercase bg-accent/10 dark:bg-dark-accent/20 text-accent dark:text-dark-accent rounded-full px-2.5 py-1 mb-2">
            {t('Novedades')}
          </span>
          <h2 id="novedades-titulo" className="text-xl font-display font-semibold tracking-tight pr-8">
            {t('Esto es lo nuevo en Qovento')}
          </h2>
          <p className="mt-1 text-[13px] text-muted dark:text-dark-text-secondary">
            {t('Sumamos varias mejoras al sistema. Un resumen rápido:')}
          </p>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-3.5">
          {items.map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 h-9 w-9 rounded-xl bg-accent/10 dark:bg-dark-accent/20 text-accent dark:text-dark-accent flex items-center justify-center">
                {item.icono}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{item.titulo}</p>
                <p className="text-[13px] text-muted dark:text-dark-text-secondary leading-snug mt-0.5">{item.descripcion}</p>
                <span className="inline-block mt-1 text-[11px] font-medium text-good dark:text-emerald-400">{item.donde}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pt-3 pb-6 shrink-0">
          <p className="text-[11px] text-muted dark:text-dark-text-secondary text-center mb-3">
            {t('Ya está todo funcionando — no hay que actualizar nada.')}
          </p>
          <button
            onClick={cerrar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-center text-sm font-medium text-white"
          >
            {t('Entendido')}
          </button>
        </div>
      </div>

      <style>{`
        .nv-overlay { animation: nvFade 0.2s ease-out; }
        .nv-card { animation: nvPop 0.25s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes nvFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nvPop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .nv-overlay, .nv-card { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
