export type EstadoReparacion =
  | 'recibido'
  | 'esperando_diagnostico'
  | 'esperando_aprobacion'
  | 'esperando_repuesto'
  | 'en_reparacion'
  | 'listo_para_entregar'
  | 'entregado'
  | 'cancelado';

export type GrupoEstado = 'pendientes' | 'en_proceso' | 'en_espera' | 'listos' | 'finalizados';

export const ESTADOS_REPARACION: { id: EstadoReparacion; label: string; grupo: GrupoEstado; color: string }[] = [
  { id: 'recibido', label: 'Recibido', grupo: 'pendientes', color: 'bg-accent/15 text-accent' },
  { id: 'esperando_diagnostico', label: 'Esperando diagnóstico', grupo: 'pendientes', color: 'bg-accent/15 text-accent' },
  { id: 'esperando_aprobacion', label: 'Esperando aprobación', grupo: 'en_espera', color: 'bg-warn/15 text-warn' },
  { id: 'esperando_repuesto', label: 'Esperando repuesto', grupo: 'en_espera', color: 'bg-warn/15 text-warn' },
  { id: 'en_reparacion', label: 'En reparación', grupo: 'en_proceso', color: 'bg-warn/15 text-warn' },
  { id: 'listo_para_entregar', label: 'Listo para entregar', grupo: 'listos', color: 'bg-good/15 text-good' },
  { id: 'entregado', label: 'Entregado', grupo: 'finalizados', color: 'bg-muted/15 text-muted' },
  { id: 'cancelado', label: 'Cancelado / sin solución', grupo: 'finalizados', color: 'bg-bad/15 text-bad' },
];

export const GRUPOS_ESTADO: { id: GrupoEstado; label: string }[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'en_espera', label: 'En espera' },
  { id: 'listos', label: 'Listos' },
  { id: 'finalizados', label: 'Finalizados' },
];

export const PRIORIDADES: { id: string; label: string; color: string }[] = [
  { id: 'normal', label: 'Normal', color: 'text-muted dark:text-dark-text-secondary' },
  { id: 'urgente', label: 'Urgente', color: 'text-warn' },
  { id: 'critica', label: 'Crítica', color: 'text-bad' },
];

export function infoEstado(estado: string) {
  return ESTADOS_REPARACION.find((e) => e.id === estado) ?? ESTADOS_REPARACION[0];
}

export function estadosDeGrupo(grupo: GrupoEstado) {
  return ESTADOS_REPARACION.filter((e) => e.grupo === grupo).map((e) => e.id);
}
