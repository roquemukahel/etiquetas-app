// Fecha+hora para boletas/comprobantes/auditoría: SIEMPRE huso horario
// Argentina y formato 24hs, sin importar el navegador/SO de quien mira la
// pantalla (2026-09-29, reclamo real de un cliente: la boleta de una orden
// mostraba "09:14:36" y la Auditoría del mismo evento mostraba "09:14 p.
// m." — cada pantalla dejaba que Intl resolviera AM/PM vs 24hs y el huso
// horario local del dispositivo, así que un mismo evento podía verse
// distinto según qué pantalla o qué equipo lo mirara). Mismo criterio que
// formatearMonto en app/lib/numeros.ts: un solo formateador compartido en
// vez de que cada pantalla arme el suyo con Intl a mano.
export function formatearFechaHora(iso: string, locale: string = 'es-AR'): string {
  return new Date(iso).toLocaleString(locale, {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// "Hoy" / "este mes" según el huso del NEGOCIO, no el del proceso que corre el
// código. En el navegador new Date() ya está en la hora del dueño, pero Inicio
// se arma en el servidor (Vercel corre en UTC): ahí setHours(0,0,0,0) cortaba
// el día a las 21:00 de Argentina, así que una venta de las 22:00 contaba para
// "mañana" y el cierre de mes llegaba tres horas antes. Mismo criterio que
// formatearFechaHora: un solo huso para todo (Argentina).
// ---------------------------------------------------------------------------
export const ZONA_HORARIA_NEGOCIO = 'America/Argentina/Buenos_Aires';

type PartesFecha = { anio: number; mes: number; dia: number; hora: number; minuto: number; segundo: number };

function partesEnZona(instante: Date, zona: string): PartesFecha {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const p: Record<string, number> = {};
  for (const parte of f.formatToParts(instante)) if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second };
}

// Instante (UTC) en que empieza el día `anio-mes-dia` en esa zona. Se parte de
// medianoche UTC y se corrige por el desfase real de la zona en esa fecha
// (dos pasadas: la segunda cubre el caso de cambio de horario de verano).
function medianocheEnZona(anio: number, mes: number, dia: number, zona: string): Date {
  const objetivo = Date.UTC(anio, mes - 1, dia, 0, 0, 0); // la hora de pared buscada, leída como si fuera UTC
  let instante = objetivo;
  for (let i = 0; i < 2; i++) {
    const p = partesEnZona(new Date(instante), zona);
    const paredActual = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
    instante += objetivo - paredActual;
  }
  return new Date(instante);
}

// Medianoche del día de `referencia` (hoy por defecto) en la zona del negocio,
// moviéndose `diasAtras` días hacia atrás (usa el calendario, no resta 24 h).
export function inicioDelDiaNegocio(referencia: Date = new Date(), diasAtras = 0, zona: string = ZONA_HORARIA_NEGOCIO): Date {
  const p = partesEnZona(referencia, zona);
  const calendario = new Date(Date.UTC(p.anio, p.mes - 1, p.dia - diasAtras));
  return medianocheEnZona(calendario.getUTCFullYear(), calendario.getUTCMonth() + 1, calendario.getUTCDate(), zona);
}

// Medianoche del día 1 del mes de `referencia`, `mesesAtras` meses antes.
export function inicioDelMesNegocio(referencia: Date = new Date(), mesesAtras = 0, zona: string = ZONA_HORARIA_NEGOCIO): Date {
  const p = partesEnZona(referencia, zona);
  const calendario = new Date(Date.UTC(p.anio, p.mes - 1 - mesesAtras, 1));
  return medianocheEnZona(calendario.getUTCFullYear(), calendario.getUTCMonth() + 1, 1, zona);
}

// 'YYYY-MM-DD' del día de `instante` en la zona del negocio (para comparar con
// columnas `date`).
export function fechaISONegocio(instante: Date = new Date(), zona: string = ZONA_HORARIA_NEGOCIO): string {
  const p = partesEnZona(instante, zona);
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}
