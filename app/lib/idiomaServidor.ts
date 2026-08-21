// Lado servidor de app/lib/idioma.ts — para Server Components (ej.
// app/page.tsx) que calculan textos ANTES de mandarlos al navegador y no
// pueden usar hooks de React ni localStorage. Lee la misma cookie
// `qovento_idioma` que escribe el selector de idioma (cliente).
import { cookies } from 'next/headers';
import { traducir, esIdiomaValido, type Idioma } from './i18n/traducir';

export function obtenerIdiomaServidor(): Idioma {
  const valor = cookies().get('qovento_idioma')?.value;
  return esIdiomaValido(valor) ? valor : 'es';
}

export { traducir };
export type { Idioma };
