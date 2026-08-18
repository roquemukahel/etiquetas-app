export type EstadoReparacion =
  | 'recibido'
  | 'esperando_diagnostico'
  | 'esperando_aprobacion'
  | 'esperando_repuesto'
  | 'en_reparacion'
  | 'listo_para_entregar'
  | 'entregado'
  | 'cancelado';

export type GrupoEstado = 'pendientes' | 'en_proceso' | 'en_espera' | 'listos';

// "color" es la clase bg/text para el badge; "acento" es el token plano
// (para bordes/puntos/franjas laterales); "icono" acompaña siempre al color
// para que el estado nunca se comunique solo por color (accesibilidad).
export const ESTADOS_REPARACION: {
  id: EstadoReparacion;
  label: string;
  grupo: GrupoEstado;
  color: string;
  acento: string;
  icono: string;
}[] = [
  { id: 'recibido', label: 'Recibido', grupo: 'pendientes', color: 'bg-accent/15 text-accent', acento: 'accent', icono: '📥' },
  { id: 'esperando_diagnostico', label: 'Esperando diagnóstico', grupo: 'pendientes', color: 'bg-diag/15 text-diag', acento: 'diag', icono: '🔍' },
  { id: 'esperando_aprobacion', label: 'Esperando aprobación', grupo: 'en_espera', color: 'bg-warn/15 text-warn', acento: 'warn', icono: '📋' },
  { id: 'esperando_repuesto', label: 'Esperando repuesto', grupo: 'en_espera', color: 'bg-warn/15 text-warn', acento: 'warn', icono: '📦' },
  { id: 'en_reparacion', label: 'En reparación', grupo: 'en_proceso', color: 'bg-repar/15 text-repar', acento: 'repar', icono: '🔧' },
  { id: 'listo_para_entregar', label: 'Listo para entregar', grupo: 'listos', color: 'bg-good/15 text-good', acento: 'good', icono: '✅' },
  { id: 'entregado', label: 'Entregado', grupo: 'listos', color: 'bg-muted/15 text-muted', acento: 'muted', icono: '🤝' },
  { id: 'cancelado', label: 'Cancelado / sin solución', grupo: 'listos', color: 'bg-bad/15 text-bad', acento: 'bad', icono: '⛔' },
];

export const GRUPOS_ESTADO: { id: GrupoEstado; label: string }[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'en_espera', label: 'En espera' },
  { id: 'listos', label: 'Listos' },
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
  // pantalla_estado queda por compatibilidad con reparaciones viejas, pero ya
  // no se usa: "Pantalla" se sacó del checklist a pedido del usuario.
  pantalla_estado: string | null;
  modulo_ok: boolean | null;
  senal_ok: boolean | null;
  camara_frontal_ok: boolean | null;
  camara_trasera_ok: boolean | null;
  flash_ok: boolean | null;
  microfono_superior_ok: boolean | null;
  microfono_inferior_ok: boolean | null;
  altavoces_ok: boolean | null;
  boton_silencio_ok: boolean | null;
  boton_power_ok: boolean | null;
  boton_volumen_ok: boolean | null;
  pin_carga_ok: boolean | null;
  carga_magsafe_ok: boolean | null;
  biometria_ok: boolean | null;
  conectores_ok: boolean | null;
  humedad: boolean | null;
  garantia_excepcion_manual: string | null;
};

// Ordenado de más importante a menos: primero módulo y señal, después lo
// crítico (Face ID, cámaras), y al final los botones físicos.
export const ITEMS_CHECKLIST_INGRESO: { campo: keyof ChecklistIngreso; label: string }[] = [
  { campo: 'modulo_ok', label: 'Módulo' },
  { campo: 'senal_ok', label: 'Señal' },
  { campo: 'biometria_ok', label: 'Face ID / Touch ID' },
  { campo: 'camara_trasera_ok', label: 'Cámara trasera' },
  { campo: 'camara_frontal_ok', label: 'Cámara frontal' },
  { campo: 'flash_ok', label: 'Flash' },
  { campo: 'microfono_superior_ok', label: 'Micrófono superior' },
  { campo: 'microfono_inferior_ok', label: 'Micrófono inferior' },
  { campo: 'altavoces_ok', label: 'Altavoces' },
  { campo: 'conectores_ok', label: 'Conectores' },
  { campo: 'boton_silencio_ok', label: 'Botón silencio' },
  { campo: 'boton_power_ok', label: 'Botón Power' },
  { campo: 'boton_volumen_ok', label: 'Botón Volumen' },
  { campo: 'pin_carga_ok', label: 'Pin de carga' },
  { campo: 'carga_magsafe_ok', label: 'Carga MagSafe' },
];

// Cosas que NO se pueden probar si el módulo no anda → se deshabilitan/anulan
// automáticamente cuando el módulo está apagado.
export const CAMPOS_DEPENDEN_MODULO: (keyof ChecklistIngreso)[] = [
  'biometria_ok',
  'camara_trasera_ok',
  'camara_frontal_ok',
  'flash_ok',
];

// Texto listo para copiar a la boleta o mandar al cliente: DEJA CONSTANCIA
// de cómo llegó el equipo (qué funcionaba y qué no al ingresar), sin ninguna
// frase de "no se garantiza" — documenta el estado previo (ej. "el botón
// power ya no funcionaba al ingresar") para respaldo, no para excluir la
// garantía de lo que sí se repara. El técnico puede sumar además una
// aclaración manual libre (ej. un componente que quedó en duda por un golpe).
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
  if (funcionan.length > 0) lineas.push(`Funciona: ${funcionan.join(', ')}`);
  if (fallan.length > 0) lineas.push(`No funcionaba al ingresar: ${fallan.join(', ')}`);
  if (r.humedad) lineas.push('Con signos de humedad o manipulación previa');

  if (lineas.length === 0 && !r.garantia_excepcion_manual) return '';

  const texto = lineas.length > 0 ? `Condición del equipo al ingresar:\n${lineas.join('\n')}` : '';

  // Aclaración manual del técnico (texto libre): se muestra tal cual, aparte
  // de la condición de ingreso. Ya no se genera la vieja frase automática
  // "No se garantiza tras la reparación" (confundía al cliente: si traen un
  // equipo con la batería hinchada para repararla, esa reparación sí tiene
  // garantía; lo que dejamos es la constancia de qué ya venía fallado).
  if (r.garantia_excepcion_manual) {
    return texto ? `${texto}\n\nAclaración: ${r.garantia_excepcion_manual}` : `Aclaración: ${r.garantia_excepcion_manual}`;
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
