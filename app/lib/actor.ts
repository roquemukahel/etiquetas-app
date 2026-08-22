'use client';

import { useEffect, useState } from 'react';

// Quién está usando el sistema en este navegador ahora mismo (vendedor o
// técnico). Es identificación por nombre para trazabilidad, NO un login con
// contraseña — cualquiera puede elegir el nombre de otro. Se guarda en este
// dispositivo/navegador (localStorage), no viaja con la cuenta.
//
// Mismas 7 columnas de permisos en vendedores y técnicos (un técnico a
// veces también vende, un vendedor a veces recibe/gestiona Servicio
// Técnico) — ver app/lib/permisos.ts.
export type Permisos = {
  // Un escalón arriba de accesoCompleto: además de todas las acciones
  // operativas, puede ver Auditoría y gestionar a otros vendedores/
  // técnicos (agregarlos, editarles permisos/PIN). Ni siquiera
  // accesoCompleto alcanza para eso — ver app/lib/permisos.ts.
  esAdministrador: boolean;
  accesoCompleto: boolean;
  puedeVender: boolean;
  puedeEliminar: boolean;
  puedeAgregarStock: boolean;
  puedeVerEstadisticas: boolean;
  puedeRecibirServicioTecnico: boolean;
  puedeGestionarServicioTecnico: boolean;
  puedeGestionarFinanciacion: boolean;
};

export type Actor = {
  tipo: 'vendedor' | 'tecnico';
  id: string;
  nombre: string;
  fotoUrl?: string | null;
  // Ausente en un actor guardado antes de que existiera este campo.
  permisos?: Permisos;
  // Sucursal asignada a esta persona en Configuración (null/ausente = sin
  // asignar, típicamente el dueño/administrador que circula entre locales
  // — ver app/lib/sucursal.ts para cómo se resuelve "la sucursal actual"
  // en ese caso).
  sucursalId?: string | null;
};

const KEY = 'qovento:actor';
const EVENTO_CAMBIO = 'qovento:actor-changed';

// Mensaje único para cuando una acción necesita saber quién la hizo (para
// que aparezca bien en Actividad reciente) pero no hay nadie elegido en
// "Cambiar" — mismo texto en todos los lugares que lo usan.
export const MENSAJE_ACTOR_REQUERIDO = 'Elegí primero quién sos (arriba, donde dice "Cambiar") antes de continuar.';

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
