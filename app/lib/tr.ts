import { traducir } from './i18n/traducir';
import { getIdioma } from './idioma';

// Traduce un texto desde código que no es un componente (librerías de servicio que devuelven mensajes de error o avisos que después
// se muestran en pantalla). Usa el idioma elegido en este navegador; en el servidor y en los tests siempre es español.
export const tr = (texto: string): string => traducir(getIdioma(), texto);
