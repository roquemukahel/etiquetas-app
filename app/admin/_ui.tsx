'use client';

// ============================================================
// Piezas compartidas del panel Admin. Los StatCard/SeccionCard/
// EmptyState/Skeleton/SegmentedChips/InfoTip/TrendIndicator/formatMoneda
// ya existen en app/estadisticas/ui.tsx y se reexportan de acá sin
// duplicarlos — mismo sistema visual que el resto de la app, no uno
// nuevo. Lo único agregado acá es lo específico de Admin: badges de
// estado de suscripción y el selector de período con rango personalizado.
// ============================================================

import { StatCard, SeccionCard, EmptyState, Skeleton, SegmentedChips, InfoTip, TrendIndicator, formatMoneda } from '../estadisticas/ui';
import CampoFecha from '../CampoFecha';

export { StatCard, SeccionCard, EmptyState, Skeleton, SegmentedChips, InfoTip, TrendIndicator, formatMoneda };

export type EstadoSuscripcion = 'trialing' | 'active' | 'past_due' | 'unpaid' | 'cancelled' | 'expired' | 'paused';

const ESTADOS: Record<EstadoSuscripcion, { label: string; clase: string }> = {
  trialing: { label: 'En prueba', clase: 'bg-accent/15 text-accent dark:bg-dark-accent/15 dark:text-dark-accent' },
  active: { label: 'Activa', clase: 'bg-good/15 text-good' },
  past_due: { label: 'Pago pendiente', clase: 'bg-warn/15 text-warn' },
  unpaid: { label: 'Pago pendiente', clase: 'bg-warn/15 text-warn' },
  paused: { label: 'Pausada', clase: 'bg-warn/15 text-warn' },
  cancelled: { label: 'Cancelada', clase: 'bg-bad/15 text-bad' },
  expired: { label: 'Cancelada', clase: 'bg-bad/15 text-bad' },
};

function Pill({ texto, clase }: { texto: string; clase: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${clase}`}>{texto}</span>;
}

// La suspensión manual (activo=false) pisa visualmente al estado de
// suscripción: un negocio puede estar "active" en Lemon Squeezy y sin
// embargo tener el acceso cortado a mano — lo importante para el admin
// es ver "Suspendida" primero, no que siga pagando.
export function EstadoBadge({ activo, estadoSuscripcion }: { activo: boolean; estadoSuscripcion: string }) {
  if (!activo) return <Pill texto="Suspendida" clase="bg-bad/15 text-bad" />;
  const info = ESTADOS[estadoSuscripcion as EstadoSuscripcion];
  if (!info) return <Pill texto={estadoSuscripcion || 'Sin plan'} clase="bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary" />;
  return <Pill texto={info.label} clase={info.clase} />;
}

export function AccesoManualChip({ hasta }: { hasta: string | null }) {
  if (!hasta) return null;
  return <Pill texto="Acceso manual" clase="bg-diag/15 text-diag" />;
}

export function EtiquetaNotaChip({ etiqueta }: { etiqueta: string }) {
  const LABELS: Record<string, string> = {
    vip: 'VIP',
    necesita_asistencia: 'Necesita asistencia',
    contactar_antes_vencimiento: 'Contactar antes del vencimiento',
    prueba_extendida: 'Prueba extendida',
    incidencia_pago: 'Incidencia de pago',
    cliente_recuperado: 'Cliente recuperado',
  };
  return <Pill texto={LABELS[etiqueta] ?? etiqueta} clase="bg-accent/15 text-accent dark:bg-dark-accent/15 dark:text-dark-accent" />;
}

export type Periodo = 'hoy' | '7d' | '30d' | 'mes' | 'mes_anterior' | 'personalizado';

export function rangoDePeriodo(periodo: Periodo, desdePersonalizado?: string, hastaPersonalizado?: string): { desde: Date; hasta: Date } {
  const ahora = new Date();
  const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  switch (periodo) {
    case 'hoy':
      return { desde: hoyInicio, hasta: ahora };
    case '7d':
      return { desde: new Date(hoyInicio.getTime() - 7 * 86400000), hasta: ahora };
    case '30d':
      return { desde: new Date(hoyInicio.getTime() - 30 * 86400000), hasta: ahora };
    case 'mes':
      return { desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1), hasta: ahora };
    case 'mes_anterior': {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: inicio, hasta: fin };
    }
    case 'personalizado':
      return {
        desde: desdePersonalizado ? new Date(desdePersonalizado) : hoyInicio,
        hasta: hastaPersonalizado ? new Date(hastaPersonalizado + 'T23:59:59') : ahora,
      };
  }
}

export function PeriodoSelector({
  valor,
  onChange,
  desdePersonalizado,
  hastaPersonalizado,
  onCambiarPersonalizado,
}: {
  valor: Periodo;
  onChange: (p: Periodo) => void;
  desdePersonalizado: string;
  hastaPersonalizado: string;
  onCambiarPersonalizado: (desde: string, hasta: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedChips
        valor={valor}
        onChange={onChange}
        size="sm"
        opciones={[
          { key: 'hoy', label: 'Hoy' },
          { key: '7d', label: '7 días' },
          { key: '30d', label: '30 días' },
          { key: 'mes', label: 'Este mes' },
          { key: 'mes_anterior', label: 'Mes anterior' },
          { key: 'personalizado', label: 'Rango' },
        ]}
      />
      {valor === 'personalizado' && (
        <div className="flex items-center gap-1.5">
          <CampoFecha
            value={desdePersonalizado}
            onChange={(iso) => onCambiarPersonalizado(iso, hastaPersonalizado)}
            classNameSelect="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-1.5 py-1 text-xs"
          />
          <span className="text-xs text-muted dark:text-dark-text-secondary">a</span>
          <CampoFecha
            value={hastaPersonalizado}
            onChange={(iso) => onCambiarPersonalizado(desdePersonalizado, iso)}
            classNameSelect="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-1.5 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

// Métrica sin datos suficientes: nunca mostramos "0" engañoso.
export function MetricaNoDisponible({ etiqueta, tooltip }: { etiqueta: string; tooltip: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-dashed border-border dark:border-dark-border p-4 flex flex-col gap-1">
      <span className="text-[12px] text-muted dark:text-dark-text-secondary flex items-center">
        {etiqueta}
        <InfoTip texto={tooltip} />
      </span>
      <span className="font-display font-semibold leading-tight text-2xl text-muted dark:text-dark-text-secondary">No disponible</span>
    </div>
  );
}
