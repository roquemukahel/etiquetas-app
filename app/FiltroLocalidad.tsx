'use client';

import { SIN_LOCALIDAD } from './lib/localidades';
import { useT } from './lib/idioma';

// Desplegable "Todas las localidades" para armar recorridos de cobranza. Solo se
// muestra si hay al menos una localidad cargada.
export default function FiltroLocalidad({
  opciones,
  value,
  onChange,
  conSinLocalidad = true,
  className = 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-3 py-2 text-sm',
}: {
  opciones: string[];
  value: string;
  onChange: (v: string) => void;
  conSinLocalidad?: boolean;
  className?: string;
}) {
  const t = useT();
  if (opciones.length === 0) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Localidad')} className={className}>
      <option value="">📍 {t('Todas las localidades')}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          📍 {o}
        </option>
      ))}
      {conSinLocalidad && <option value={SIN_LOCALIDAD}>📍 {t('Sin localidad')}</option>}
    </select>
  );
}
