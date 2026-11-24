import { describe, expect, it } from 'vitest';
import { CALIDADES_PREDETERMINADAS, combinarOpciones, contarUsos, opcionesFaltantes } from './repuestosOpciones';

describe('combinarOpciones', () => {
  it('mantiene el orden configurado y agrega al final lo que está en uso y no configurado', () => {
    expect(combinarOpciones(['Premium', 'Compatible'], ['Original', 'premium', 'Compatible'])).toEqual(['Premium', 'Compatible', 'Original']);
  });

  it('no repite opciones que solo difieren en mayúsculas o espacios', () => {
    expect(combinarOpciones(['Pantalla'], ['pantalla', ' PANTALLA ', 'Batería'])).toEqual(['Pantalla', 'Batería']);
  });

  it('ignora vacíos y nulos', () => {
    expect(combinarOpciones([], [null, undefined, '', '  '])).toEqual([]);
  });

  it('las calidades de siempre se conservan como valores predeterminados', () => {
    expect(CALIDADES_PREDETERMINADAS).toEqual(['Original', 'OEM', 'Premium', 'Compatible', 'Otra']);
  });
});

describe('opcionesFaltantes', () => {
  it('trae lo que los repuestos usan y no está en la lista, una sola vez por variante', () => {
    expect(opcionesFaltantes(['Pantalla'], ['pantalla', 'Batería', 'batería', 'Batería', 'Flex'])).toEqual(['Batería', 'Flex']);
  });

  it('de las variantes de escritura elige la más usada', () => {
    expect(opcionesFaltantes([], ['modulo', 'Modulo', 'Modulo', 'MODULO'])).toEqual(['Modulo']);
  });

  it('no devuelve nada si todo ya está en la lista', () => {
    expect(opcionesFaltantes(['Pantalla'], ['PANTALLA', ' pantalla'])).toEqual([]);
  });
});

describe('contarUsos', () => {
  it('cuenta sin distinguir mayúsculas y salta vacíos', () => {
    const conteo = contarUsos(['Pantalla', 'pantalla', ' PANTALLA ', 'Batería', null, '']);
    expect(conteo.get('pantalla')).toBe(3);
    expect(conteo.get('batería')).toBe(1);
    expect(conteo.has('')).toBe(false);
  });
});
