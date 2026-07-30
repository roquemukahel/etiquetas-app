'use client';

// Quién está usando el sistema en este navegador ahora mismo (vendedor o
// técnico). Es identificación por nombre para trazabilidad, NO un login con
// contraseña — cualquiera puede elegir el nombre de otro. Se guarda en este
// dispositivo/navegador (localStorage), no viaja con la cuenta.
export type Actor = { tipo: 'vendedor' | 'tecnico'; id: string; nombre: string };

const KEY = 'qovento:actor';

export function getActor(): Actor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Actor) : null;
  } catch {
    return null;
  }
}

export function setActor(actor: Actor) {
  window.localStorage.setItem(KEY, JSON.stringify(actor));
}

export function clearActor() {
  window.localStorage.removeItem(KEY);
}
