// Bloqueo por inactividad: si en este equipo nadie toca el sistema durante un rato, se vuelve a pedir quién está trabajando
// (el mismo cartel "¿Con quién tengo el gusto?", con el PIN de la persona si lo tiene). Así, cuando alguien se va y otra
// persona se sienta en la misma PC, no sigue cargando cosas a nombre del anterior.
//
// Todo vive en este navegador (localStorage), igual que "quién está trabajando" (ver app/lib/actor.ts): la última actividad
// se comparte entre pestañas, y el tiempo elegido es una preferencia de este equipo.

export const KEY_ULTIMA_ACTIVIDAD = 'qovento:ultima-actividad';
export const KEY_MINUTOS_BLOQUEO = 'qovento:bloqueo-minutos';
export const MINUTOS_BLOQUEO_POR_DEFECTO = 30;

// 0 = nunca se bloquea.
export const OPCIONES_BLOQUEO: { minutos: number; label: string }[] = [
  { minutos: 15, label: '15 minutos' },
  { minutos: 30, label: '30 minutos' },
  { minutos: 60, label: '1 hora' },
  { minutos: 120, label: '2 horas' },
  { minutos: 0, label: 'Nunca' },
];

// Un valor guardado que no es una de las opciones (o está dañado) vuelve al valor por defecto.
export function normalizarMinutosBloqueo(valor: string | number | null | undefined): number {
  const n = typeof valor === 'number' ? valor : valor == null || valor === '' ? NaN : Number(valor);
  return OPCIONES_BLOQUEO.some((o) => o.minutos === n) ? n : MINUTOS_BLOQUEO_POR_DEFECTO;
}

// ¿Pasó más tiempo del permitido desde la última actividad? Sin dato de última actividad (primera vez en este equipo)
// no se bloquea: se empieza a contar desde ahora.
export function estaInactivo(ultimaActividad: number | null, ahora: number, minutosDeBloqueo: number): boolean {
  if (minutosDeBloqueo <= 0 || ultimaActividad == null || !Number.isFinite(ultimaActividad)) return false;
  return ahora - ultimaActividad > minutosDeBloqueo * 60_000;
}

export function leerMinutosDeBloqueo(): number {
  if (typeof window === 'undefined') return MINUTOS_BLOQUEO_POR_DEFECTO;
  try {
    return normalizarMinutosBloqueo(window.localStorage.getItem(KEY_MINUTOS_BLOQUEO));
  } catch {
    return MINUTOS_BLOQUEO_POR_DEFECTO;
  }
}

export function guardarMinutosDeBloqueo(minutos: number) {
  try {
    window.localStorage.setItem(KEY_MINUTOS_BLOQUEO, String(normalizarMinutosBloqueo(minutos)));
  } catch {
    // Sin almacenamiento disponible: queda el valor por defecto.
  }
}

export function leerUltimaActividad(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(KEY_ULTIMA_ACTIVIDAD);
    const n = crudo == null ? NaN : Number(crudo);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function marcarActividad(ahora: number = Date.now()) {
  try {
    window.localStorage.setItem(KEY_ULTIMA_ACTIVIDAD, String(ahora));
  } catch {
    // Sin almacenamiento disponible: el bloqueo simplemente no se activa.
  }
}
