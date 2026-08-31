// Función pura de traducción — sin 'use client', sin I/O — para poder
// usarse tanto desde componentes cliente (app/lib/idioma.ts) como desde
// Server Components (app/lib/idiomaServidor.ts), que son dos mundos
// distintos en Next.js App Router y no pueden compartir hooks de React.
//
// A propósito NO importa pt.ts/en.ts acá arriba (ver git history si hace
// falta el porqué): este módulo lo importa app/lib/idioma.ts, que es
// 'use client' — un import estático de ambos diccionarios (~165KB cada
// uno) quedaba empaquetado en el bundle de CADA página para TODOS los
// negocios, aunque el 100% use español. app/lib/idiomaServidor.ts (lado
// servidor, el bundle no viaja al navegador) registra los diccionarios
// completos de una sola vez al importarse; app/lib/idioma.ts (lado
// cliente) los carga bajo demanda con import() solo cuando el idioma
// elegido no es español, así ese peso solo lo paga quien realmente
// eligió portugués/inglés.
export type Idioma = 'es' | 'pt' | 'en';

export function esIdiomaValido(v: string | undefined | null): v is Idioma {
  return v === 'es' || v === 'pt' || v === 'en';
}

const DICCIONARIOS: Record<Idioma, Record<string, string>> = { es: {}, pt: {}, en: {} };

export function registrarDiccionario(idioma: Idioma, diccionario: Record<string, string>) {
  DICCIONARIOS[idioma] = diccionario;
}

// El texto en español es tanto el valor por defecto como la clave de
// búsqueda — ver app/lib/idioma.ts para el porqué de este diseño. Si el
// diccionario de pt/en todavía no se registró (en el cliente, mientras el
// chunk se está bajando), devuelve el texto en español sin traducir.
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
