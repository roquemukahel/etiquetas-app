// ============================================================
// Defensas de Qovi contra uso indebido — funciones puras, sin tocar red ni
// base de datos, para poder testearlas directo.
// ============================================================
import { QOVI_MAX_LARGO_MENSAJE } from './config';

// Frases típicas de intento de prompt injection (las mismas que pide bloquear
// el pedido original) — si el mensaje las contiene, se corta ACÁ, sin
// siquiera llamar a Claude: defensa determinística, no depende de que el
// modelo "se porte bien".
const FRASES_PROHIBIDAS: RegExp[] = [
  /ignor[aá].{0,20}(tus )?instruccion/i,
  /mostr[aá].{0,20}(tu |el )?prompt/i,
  /variables? de entorno/i,
  /dame informaci[oó]n de otros? (negocios?|comercios?|clientes?)/i,
  /actu[aá].{0,20}como otra (inteligencia artificial|ia|modelo)/i,
  /revel[aá].{0,20}(tus? )?instruccion/i,
  /system prompt/i,
  /api[_ ]?key/i,
];

export function pareceIntentoDeInyeccion(mensaje: string): boolean {
  return FRASES_PROHIBIDAS.some((regex) => regex.test(mensaje));
}

export type ResultadoValidacionMensaje = { ok: true; texto: string } | { ok: false; motivo: string };

// Sanitiza (recorta espacios, quita caracteres de control) y valida largo.
// No rechaza el mensaje por sospecha de inyección acá — eso lo maneja el
// caller con pareceIntentoDeInyeccion, que necesita loguearse distinto.
export function validarMensaje(mensaje: unknown): ResultadoValidacionMensaje {
  if (typeof mensaje !== 'string') return { ok: false, motivo: 'El mensaje tiene que ser texto.' };
  // eslint-disable-next-line no-control-regex
  const limpio = mensaje.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (!limpio) return { ok: false, motivo: 'El mensaje no puede estar vacío.' };
  if (limpio.length > QOVI_MAX_LARGO_MENSAJE) {
    return { ok: false, motivo: `El mensaje es demasiado largo (máximo ${QOVI_MAX_LARGO_MENSAJE} caracteres).` };
  }
  return { ok: true, texto: limpio };
}
