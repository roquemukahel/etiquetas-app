import { describe, expect, it } from 'vitest';
import { estaInactivo, MINUTOS_BLOQUEO_POR_DEFECTO, normalizarMinutosBloqueo } from './inactividad';

const MIN = 60_000;

describe('bloqueo por inactividad', () => {
  it('no se bloquea mientras no pase el tiempo elegido', () => {
    expect(estaInactivo(1000, 1000 + 29 * MIN, 30)).toBe(false);
    expect(estaInactivo(1000, 1000 + 30 * MIN, 30)).toBe(false);
  });
  it('se bloquea cuando pasa el tiempo elegido', () => {
    expect(estaInactivo(1000, 1000 + 30 * MIN + 1, 30)).toBe(true);
    expect(estaInactivo(1000, 1000 + 8 * 60 * MIN, 30)).toBe(true); // la PC quedó toda la noche
  });
  it('"Nunca" (0) no bloquea jamás', () => {
    expect(estaInactivo(1000, 1000 + 999 * 60 * MIN, 0)).toBe(false);
  });
  it('sin dato de última actividad no bloquea (se empieza a contar desde ahora)', () => {
    expect(estaInactivo(null, 5 * 60 * MIN, 30)).toBe(false);
    expect(estaInactivo(Number.NaN, 5 * 60 * MIN, 30)).toBe(false);
  });
  it('respeta cada opción de tiempo', () => {
    expect(estaInactivo(0, 16 * MIN, 15)).toBe(true);
    expect(estaInactivo(0, 16 * MIN, 60)).toBe(false);
    expect(estaInactivo(0, 61 * MIN, 60)).toBe(true);
  });
});

describe('tiempo guardado', () => {
  it('acepta las opciones válidas', () => {
    expect(normalizarMinutosBloqueo('15')).toBe(15);
    expect(normalizarMinutosBloqueo('120')).toBe(120);
    expect(normalizarMinutosBloqueo('0')).toBe(0);
    expect(normalizarMinutosBloqueo(60)).toBe(60);
  });
  it('un valor roto o inexistente vuelve al de por defecto', () => {
    expect(normalizarMinutosBloqueo(null)).toBe(MINUTOS_BLOQUEO_POR_DEFECTO);
    expect(normalizarMinutosBloqueo('')).toBe(MINUTOS_BLOQUEO_POR_DEFECTO);
    expect(normalizarMinutosBloqueo('abc')).toBe(MINUTOS_BLOQUEO_POR_DEFECTO);
    expect(normalizarMinutosBloqueo('7')).toBe(MINUTOS_BLOQUEO_POR_DEFECTO);
    expect(normalizarMinutosBloqueo(-5)).toBe(MINUTOS_BLOQUEO_POR_DEFECTO);
  });
});
