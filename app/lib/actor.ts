'use client';

import { useEffect, useState } from 'react';

// Quién está usando el sistema en este navegador ahora mismo (vendedor o
// técnico). Es identificación por nombre para trazabilidad, NO un login con
// contraseña — cualquiera puede elegir el nombre de otro. Se guarda en este
// dispositivo/navegador (localStorage), no viaja con la cuenta.
export type PermisosVendedor = {
  accesoCompleto: boolean;
  puedeVender: boolean;
  puedeEliminar: boolean;
  puedeAgregarStock: boolean;
  puedeVerEstadisticas: boolean;
};

export type Actor = {
  tipo: 'vendedor' | 'tecnico';
  id: string;
  nombre: string;
  fotoUrl?: string | null;
  // Solo se completa para vendedores (ver app/lib/permisos.ts). Ausente en
  // técnicos o en un actor guardado antes de que existiera este campo.
  permisos?: PermisosVendedor;
};

const KEY = 'qovento:actor';
const EVENTO_CAMBIO = 'qovento:actor-changed';

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
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

export function clearActor() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

// Para componentes que necesitan re-renderizar cuando cambia quién está
// eligiendo trabajar (ej. para habilitar/deshabilitar botones según
// permisos) — getActor() solo no alcanza porque no es reactivo.
export function useActor(): Actor | null {
  const [actor, setActorState] = useState<Actor | null>(() => getActor());
  useEffect(() => {
    const actualizar = () => setActorState(getActor());
    window.addEventListener(EVENTO_CAMBIO, actualizar);
    window.addEventListener('storage', actualizar);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO, actualizar);
      window.removeEventListener('storage', actualizar);
    };
  }, []);
  return actor;
}
