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
