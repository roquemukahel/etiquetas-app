import { infoEstado } from './lib/reparaciones';

// Badge de estado de reparación: SIEMPRE combina color + ícono + texto, para
// que el estado nunca se comunique solamente por color (accesibilidad).
export default function EstadoBadge({ estado, className = '' }: { estado: string; className?: string }) {
  const info = infoEstado(estado);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${info.color} ${className}`}
    >
      <span aria-hidden="true">{info.icono}</span>
      {info.label}
    </span>
  );
}

// Franja lateral semántica para tarjetas de lista/kanban — el color nunca es
// la única señal (siempre acompaña a un EstadoBadge con ícono y texto).
const FRANJA_POR_ACENTO: Record<string, string> = {
  accent: 'bg-accent',
  diag: 'bg-diag',
  warn: 'bg-warn',
  repar: 'bg-repar',
  good: 'bg-good',
  muted: 'bg-muted dark:bg-dark-text-secondary',
  bad: 'bg-bad',
};

export function FranjaEstado({ estado, className = '' }: { estado: string; className?: string }) {
  const info = infoEstado(estado);
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${FRANJA_POR_ACENTO[info.acento] || 'bg-muted'} ${className}`} />;
}
