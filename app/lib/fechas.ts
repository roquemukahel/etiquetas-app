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
