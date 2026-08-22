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
//    fija. Ver app/AppShell.tsx (bloque arriba del menú, en el sidebar de
//    escritorio, y el botón flotante 🏬 equivalente en celular) para el
//    selector.
const KEY = 'qovento:sucursal_manual';
const EVENTO_CAMBIO = 'qovento:sucursal-manual-changed';

// Cookie espejo del id RESUELTO (fijo del actor, o manual) — no reemplaza el
// localStorage de arriba, es solo para que Inicio (app/page.tsx, Server
// Component) pueda leer "en qué sucursal estoy" sin hooks. Mismo patrón que
// app/lib/idioma.ts / app/lib/idiomaServidor.ts.
const COOKIE = 'qovento_sucursal';

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

function escribirCookie(id: string | null) {
  document.cookie = `${COOKIE}=${id ?? ''}; path=/; max-age=31536000; SameSite=Lax`;
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

  const resuelto = actor?.sucursalId ? { id: actor.sucursalId, fija: true } : { id: manual, fija: false };

  useEffect(() => {
    escribirCookie(resuelto.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resuelto.id]);

  return resuelto;
}
