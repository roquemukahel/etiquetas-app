// Función pura de traducción — sin 'use client', sin I/O — para poder
// usarse tanto desde componentes cliente (app/lib/idioma.ts) como desde
// Server Components (app/lib/idiomaServidor.ts), que son dos mundos
// distintos en Next.js App Router y no pueden compartir hooks de React.
import { PT } from './pt';
import { EN } from './en';

export type Idioma = 'es' | 'pt' | 'en';

export function esIdiomaValido(v: string | undefined | null): v is Idioma {
  return v === 'es' || v === 'pt' || v === 'en';
}

const DICCIONARIOS: Record<Idioma, Record<string, string>> = { es: {}, pt: PT, en: EN };

// El texto en español es tanto el valor por defecto como la clave de
// búsqueda — ver app/lib/idioma.ts para el porqué de este diseño.
export function traducir(idioma: Idioma, texto: string): string {
  return DICCIONARIOS[idioma][texto] ?? texto;
}

// Para boletas y comprobantes: fechas y montos formateados con
// toLocaleString/toLocaleDateString necesitan un locale real, no alcanza con
// traducir el texto que los rodea — un "12/3/2026" (formato es-AR) se lee
// distinto que "3/12/2026" (en-US) aunque las palabras alrededor ya estén en
// inglés. Uruguay/Argentina comparten formato con es-AR (no hay es-UY con
// soporte amplio en Intl), así que se mantiene igual que hoy para español.
const LOCALE_POR_IDIOMA: Record<Idioma, string> = { es: 'es-AR', pt: 'pt-BR', en: 'en-US' };
export function localeDe(idioma: Idioma): string {
  return LOCALE_POR_IDIOMA[idioma];
}
