'use client';

import { useEffect, useState } from 'react';
import { traducir, esIdiomaValido, type Idioma } from './i18n/traducir';

export type { Idioma };

// Idioma de la interfaz — PRUEBA inicial, solo español/portugués.
// Se guarda en una COOKIE (no localStorage): varias pantallas clave (ej.
// Inicio, app/page.tsx) son Server Components que calculan textos en el
// servidor — solo una cookie viaja con el request y se puede leer de los
// dos lados (ver app/lib/idiomaServidor.ts para el lado servidor). Es una
// preferencia de ESTE navegador, no de la cuenta ni del negocio: dos
// personas en el mismo local pueden elegir cada una su idioma.
const COOKIE = 'qovento_idioma';
const EVENTO_CAMBIO = 'qovento:idioma-changed';

function leerCookie(): Idioma | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )qovento_idioma=([^;]*)/);
  const valor = match ? decodeURIComponent(match[1]) : null;
  return esIdiomaValido(valor) ? valor : null;
}

export function getIdioma(): Idioma {
  if (typeof window === 'undefined') return 'es';
  return leerCookie() ?? 'es';
}

export function setIdioma(idioma: Idioma) {
  // 1 año, path=/ para que la lean todas las páginas del sitio.
  document.cookie = `${COOKIE}=${idioma}; path=/; max-age=31536000; SameSite=Lax`;
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

// Orden fijo del selector (un solo botón que rota, ver SelectorDeActor.tsx
// y SelectorIdiomaFlotante.tsx) — agregar un idioma nuevo acá alcanza para
// que ambos selectores lo sumen al ciclo automáticamente.
export const IDIOMAS_DISPONIBLES: { valor: Idioma; etiqueta: string }[] = [
  { valor: 'es', etiqueta: '🇦🇷 ES' },
  { valor: 'pt', etiqueta: '🇧🇷 PT' },
  { valor: 'en', etiqueta: '🇺🇸 EN' },
];

export function siguienteIdioma(actual: Idioma): Idioma {
  const idx = IDIOMAS_DISPONIBLES.findIndex((i) => i.valor === actual);
  return IDIOMAS_DISPONIBLES[(idx + 1) % IDIOMAS_DISPONIBLES.length].valor;
}

// Reactivo (mismo patrón que useActor): componentes que llaman a t() se
// vuelven a renderizar apenas alguien cambia el idioma en esta pestaña. Un
// Server Component ya renderizado (ej. Inicio) necesita además un
// router.refresh() explícito tras cambiar — lo hace el botón del selector.
export function useIdioma(): Idioma {
  const [idioma, setIdiomaState] = useState<Idioma>(() => getIdioma());
  useEffect(() => {
    const actualizar = () => setIdiomaState(getIdioma());
    window.addEventListener(EVENTO_CAMBIO, actualizar);
    return () => window.removeEventListener(EVENTO_CAMBIO, actualizar);
  }, []);
  return idioma;
}

// t(texto) — el texto en español es tanto el valor por defecto como la
// clave de búsqueda. Interpolaciones (nombres, números) se arman en el
// llamador de la forma habitual de este proyecto: `${t('Hola')}, ${nombre}`.
export function useT() {
  const idioma = useIdioma();
  return (texto: string) => traducir(idioma, texto);
}
