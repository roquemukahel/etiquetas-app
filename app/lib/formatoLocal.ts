import { getIdioma } from './idioma';
import { localeDe } from './i18n/traducir';

// Locale de fechas y números según el idioma elegido en este navegador (es-AR / pt-BR / en-US). Solo para componentes de cliente:
// en el servidor y en los tests siempre da es-AR.
export const localeActual = (): string => localeDe(getIdioma());
