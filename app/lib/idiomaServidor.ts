// Lado servidor de app/lib/idioma.ts — para Server Components (ej.
// app/page.tsx) que calculan textos ANTES de mandarlos al navegador y no
// pueden usar hooks de React ni localStorage. Lee la misma cookie
// `qovento_idioma` que escribe el selector de idioma (cliente).
import { cookies } from 'next/headers';
import { traducir, esIdiomaValido, registrarDiccionario, type Idioma } from './i18n/traducir';
import { PT } from './i18n/pt';
import { EN } from './i18n/en';

// El servidor sí tiene los 2 diccionarios completos siempre en memoria
// (no viajan al navegador desde acá, así que no hay costo de bundle) —
// ver el comentario en traducir.ts sobre por qué el lado cliente es
// distinto.
registrarDiccionario('pt', PT);
registrarDiccionario('en', EN);

export function obtenerIdiomaServidor(): Idioma {
  const valor = cookies().get('qovento_idioma')?.value;
  return esIdiomaValido(valor) ? valor : 'es';
}

export { traducir };
export type { Idioma };
