'use client';

import { useEffect, useState } from 'react';
import { useActor } from './actor';

// "En qué sucursal estoy trabajando ahora" — mismo patrón que app/lib/
// actor.ts (localStorage, solo este navegador). Se resuelve así:
//
// 1. Si la persona elegida (ver actor.ts) tiene una sucursal FIJA asignada
//    en Configuración > Vendedores/Técnicos, esa gana siempre — ni se
//    pregunta, todo lo que carga queda etiquetado ahí.
// 2. Si no tiene sucursal fija (típicamente el dueño/administrador, que
//    circula entre locales), se usa la que eligió a mano en este
//    navegador — puede cambiar de sesión en sesión, a diferencia de la
//    fija. Ver SelectorSucursalFlotante.tsx para el selector.
const KEY = 'qovento:sucursal_manual';
const EVENTO_CAMBIO = 'qovento:sucursal-manual-changed';

function leerManual(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function getSucursalManual(): string | null {
  return leerManual();
}

export function setSucursalManual(id: string | null) {
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

// Solo el id — el nombre para mostrar lo resuelve quien llama contra su
// propia lista de sucursales ya cargada (mismo criterio que categoria_id en
// el resto de la app), para no meter acá un fetch propio.
export function useSucursalActual(): { id: string | null; fija: boolean } {
  const actor = useActor();
  const [manual, setManual] = useState<string | null>(() => leerManual());

  useEffect(() => {
    const actualizar = () => setManual(leerManual());
    window.addEventListener(EVENTO_CAMBIO, actualizar);
    window.addEventListener('storage', actualizar);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO, actualizar);
      window.removeEventListener('storage', actualizar);
    };
  }, []);

  if (actor?.sucursalId) return { id: actor.sucursalId, fija: true };
  return { id: manual, fija: false };
}
