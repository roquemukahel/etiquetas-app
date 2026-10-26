'use client';

import { memo } from 'react';
import type { EquipoStandby } from '../lib/standby';
import { diasEnStandby, esAntiguoEnStandby } from '../lib/standby';
import { formatearGB } from '../lib/almacenamiento';
import { useT } from '../lib/idioma';

// Un equipo en la lista. Una sola fila compacta (sin tarjeta): lo que sirve para reconocerlo de un vistazo — modelo,
// capacidad, color, IMEI, batería y cuánto lleva esperando — y, aparte y en otro color, por qué está en Standby.
// Es un "option" de la lista (ver ListaStandby en page.tsx): navegable con flechas y con el foco visible.
function FilaStandbyBase({
  equipo,
  imagen,
  seleccionado,
  senado,
  fotos,
  alElegir,
}: {
  equipo: EquipoStandby;
  imagen: string | null;
  seleccionado: boolean;
  senado: boolean;
  fotos: number;
  alElegir: (id: string) => void;
}) {
  const t = useT();
  const desde = equipo.en_espera_desde ?? equipo.created_at;
  const dias = diasEnStandby(desde);
  const antiguo = esAntiguoEnStandby(equipo);
  const motivo = (equipo.espera_motivo || equipo.detalles || '').replace(/\s+/g, ' ').trim();
  const bateriaBaja = equipo.salud_bateria != null && equipo.salud_bateria < 80;

  return (
    <button
      type="button"
      role="option"
      aria-selected={seleccionado}
      tabIndex={seleccionado ? 0 : -1}
      data-equipo-id={equipo.id}
      onClick={() => alElegir(equipo.id)}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left border-b border-border dark:border-dark-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent dark:focus-visible:ring-dark-accent ${
        seleccionado ? 'bg-accent-soft dark:bg-dark-accent-soft' : 'hover:bg-canvas dark:hover:bg-white/[0.03]'
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-canvas dark:bg-dark-bg">
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen} alt="" loading="lazy" decoding="async" width={44} height={44} className="h-10 w-10 object-contain" />
        ) : (
          <span aria-hidden="true" className="text-base opacity-60">
            📱
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-ink dark:text-dark-text">
            {equipo.modelo || t('Sin modelo')}
            {equipo.capacidad_gb ? <span className="font-normal text-muted dark:text-dark-text-secondary"> {formatearGB(equipo.capacidad_gb)}</span> : null}
          </span>
          {senado && (
            <span className="shrink-0 rounded-sm bg-accent-soft dark:bg-dark-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent dark:text-dark-accent">
              {t('SEÑADO')}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted dark:text-dark-text-secondary">
          {equipo.color && <span className="truncate">{equipo.color}</span>}
          {equipo.color && <span aria-hidden="true">·</span>}
          <span className="truncate font-mono tracking-tight">{equipo.imei || t('sin IMEI')}</span>
          {equipo.salud_bateria != null && (
            <>
              <span aria-hidden="true">·</span>
              <span className={`shrink-0 tabular-nums ${bateriaBaja ? 'text-warn' : ''}`}>{equipo.salud_bateria}%</span>
            </>
          )}
        </span>
        {motivo && <span className="mt-0.5 block truncate text-[11px] text-warn">{motivo}</span>}
      </span>

      <span className="shrink-0 text-right leading-tight">
        <span
          className={`block text-sm font-semibold tabular-nums ${
            dias >= 60 ? 'text-bad' : antiguo ? 'text-warn' : 'text-ink dark:text-dark-text'
          }`}
        >
          {dias === 0 ? t('hoy') : `${dias} ${t('d')}`}
        </span>
        {fotos > 0 && (
          <span className="block text-[10px] text-muted dark:text-dark-text-secondary">
            {fotos} {fotos === 1 ? t('foto') : t('fotos')}
          </span>
        )}
      </span>
    </button>
  );
}

export const FilaStandby = memo(FilaStandbyBase);
