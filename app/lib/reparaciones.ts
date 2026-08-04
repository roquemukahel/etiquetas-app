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

// Checklist de recepción: qué funciona y qué no al momento de ingresar el
// equipo. De acá sale el texto de condición/garantía — ver
// generarTextoCondicionIngreso más abajo.
export type ChecklistIngreso = {
  enciende: boolean | null;
  pantalla_estado: string | null;
  modulo_ok: boolean | null;
  camara_frontal_ok: boolean | null;
  camara_trasera_ok: boolean | null;
  flash_ok: boolean | null;
  microfono_superior_ok: boolean | null;
  microfono_inferior_ok: boolean | null;
  altavoces_ok: boolean | null;
  boton_power_ok: boolean | null;
  boton_volumen_ok: boolean | null;
  biometria_ok: boolean | null;
  conectores_ok: boolean | null;
  humedad: boolean | null;
  garantia_excepcion_manual: string | null;
};

export const ITEMS_CHECKLIST_INGRESO: { campo: keyof ChecklistIngreso; label: string }[] = [
  { campo: 'modulo_ok', label: 'Módulo / Señal' },
  { campo: 'camara_frontal_ok', label: 'Cámara frontal' },
  { campo: 'camara_trasera_ok', label: 'Cámara trasera' },
  { campo: 'flash_ok', label: 'Flash' },
  { campo: 'microfono_superior_ok', label: 'Micrófono superior' },
  { campo: 'microfono_inferior_ok', label: 'Micrófono inferior' },
  { campo: 'altavoces_ok', label: 'Altavoces' },
  { campo: 'boton_power_ok', label: 'Botón Power' },
  { campo: 'boton_volumen_ok', label: 'Botón Volumen' },
  { campo: 'biometria_ok', label: 'Face ID / Touch ID' },
  { campo: 'conectores_ok', label: 'Conectores' },
];

// Texto listo para copiar a la boleta o mandar al cliente: qué funciona,
// qué no, y qué queda automáticamente afuera de la garantía por eso (lo
// que no funcionaba al ingresar no se puede garantizar después). El
// técnico puede sumar una excepción manual aparte (ej. un componente que
// hoy funciona pero quedó en duda por un golpe fuerte en otra parte).
export function generarTextoCondicionIngreso(r: ChecklistIngreso): string {
  const funcionan: string[] = [];
  const fallan: string[] = [];

  if (r.enciende === true) funcionan.push('Enciende');
  if (r.enciende === false) fallan.push('Enciende');
  for (const item of ITEMS_CHECKLIST_INGRESO) {
    const valor = r[item.campo];
    if (valor === true) funcionan.push(item.label);
    if (valor === false) fallan.push(item.label);
  }

  const lineas: string[] = [];
  if (r.pantalla_estado) {
    lineas.push(
      r.pantalla_estado === 'ok' ? 'Pantalla: OK' : r.pantalla_estado === 'marcada' ? 'Pantalla: marcada' : 'Pantalla: rota'
    );
  }
  if (funcionan.length > 0) lineas.push(`Funciona: ${funcionan.join(', ')}`);
  if (fallan.length > 0) lineas.push(`No funciona: ${fallan.join(', ')}`);
  if (r.humedad) lineas.push('Con signos de humedad o manipulación previa');

  if (lineas.length === 0 && !r.garantia_excepcion_manual) return '';

  let texto = lineas.length > 0 ? `Condición del equipo al ingresar:\n${lineas.join('\n')}` : '';

  const excluidos = [...fallan];
  if (r.pantalla_estado === 'rota') excluidos.push('Pantalla');

  if (excluidos.length > 0 || r.garantia_excepcion_manual) {
    if (texto) texto += '\n\n';
    texto += 'No se garantiza tras la reparación:';
    if (excluidos.length > 0) texto += `\n- ${excluidos.join(', ')} (no funcionaba / dañado al ingresar)`;
    if (r.garantia_excepcion_manual) texto += `\n- ${r.garantia_excepcion_manual}`;
  }

  return texto;
}

export function estadosDeGrupo(grupo: GrupoEstado) {
  return ESTADOS_REPARACION.filter((e) => e.grupo === grupo).map((e) => e.id);
}

const FINALIZADOS = ['entregado', 'cancelado'];
const HORA = 3600 * 1000;
const DIA = 24 * HORA;

export type ReparacionParaAlerta = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  estado: string;
  tecnico_id: string | null;
  fecha_ingreso_servicio: string;
  estado_actualizado_at: string;
  fecha_estimada: string | null;
  fecha_entrega: string | null;
  garantia_dias: number | null;
};

export type Alerta = { id: string; texto: string; color: 'bad' | 'warn' };

// Una alerta por reparación como mucho (la más urgente), para no
// saturar la lista con varias líneas del mismo equipo.
export function calcularAlertas(reparaciones: ReparacionParaAlerta[]): Alerta[] {
  const ahora = Date.now();
  const alertas: Alerta[] = [];

  for (const r of reparaciones) {
    const titulo = `${r.numero_orden || ''} ${r.modelo || 'equipo'}`.trim();
    const activa = !FINALIZADOS.includes(r.estado);
    const msEnEstado = ahora - new Date(r.estado_actualizado_at).getTime();

    if (activa && r.fecha_estimada && new Date(r.fecha_estimada + 'T00:00:00').getTime() < ahora) {
      alertas.push({ id: r.id, texto: `${titulo} — fecha prometida vencida`, color: 'bad' });
      continue;
    }
    if (r.estado === 'listo_para_entregar' && msEnEstado > 7 * DIA) {
      alertas.push({ id: r.id, texto: `${titulo} — listo hace más de 7 días sin retirar`, color: 'bad' });
      continue;
    }
    if (activa && !r.tecnico_id && ahora - new Date(r.fecha_ingreso_servicio).getTime() > 24 * HORA) {
      alertas.push({ id: r.id, texto: `${titulo} — sin técnico asignado hace más de 24 horas`, color: 'warn' });
      continue;
    }
    if (r.estado === 'esperando_aprobacion' && msEnEstado > 48 * HORA) {
      alertas.push({ id: r.id, texto: `${titulo} — presupuesto sin responder hace más de 48 horas`, color: 'warn' });
      continue;
    }
    if (r.estado === 'esperando_repuesto' && msEnEstado > 3 * DIA) {
      alertas.push({ id: r.id, texto: `${titulo} — esperando un repuesto hace más de 3 días`, color: 'warn' });
      continue;
    }
    if (r.estado === 'entregado' && r.fecha_entrega && r.garantia_dias) {
      const vencimiento = new Date(r.fecha_entrega).getTime() + r.garantia_dias * DIA;
      if (vencimiento > ahora && vencimiento - ahora < 7 * DIA) {
        alertas.push({ id: r.id, texto: `${titulo} — la garantía vence esta semana`, color: 'warn' });
        continue;
      }
    }
    if (activa && msEnEstado > 10 * DIA) {
      alertas.push({ id: r.id, texto: `${titulo} — sin actualizaciones hace más de 10 días`, color: 'warn' });
    }
  }

  return alertas.sort((a, b) => (a.color === b.color ? 0 : a.color === 'bad' ? -1 : 1));
}
