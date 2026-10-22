import { describe, expect, it } from 'vitest';
import { resumenPorColor } from './resumenColores';

const unidades = (...colores: (string | null)[]) => colores.map((color) => ({ color }));

describe('resumen de unidades por color', () => {
  it('cuenta cada color y ordena del que más hay al que menos', () => {
    const r = resumenPorColor(unidades(...Array(10).fill('Azul'), ...Array(15).fill('Rojo'), ...Array(15).fill('Verde'), ...Array(5).fill('Blanco')));
    expect(r.map((c) => [c.color, c.cantidad])).toEqual([
      ['Rojo', 15],
      ['Verde', 15],
      ['Azul', 10],
      ['Blanco', 5],
    ]);
  });
  it('junta el mismo color escrito distinto y deja "sin color" al final', () => {
    const r = resumenPorColor(unidades('Rojo', 'rojo ', 'ROJO', null, '', 'Azúl', 'azul'));
    expect(r.map((c) => [c.color, c.cantidad])).toEqual([
      ['Rojo', 3],
      ['Azúl', 2],
      [null, 2],
    ]);
  });
  it('lista vacía', () => {
    expect(resumenPorColor([])).toEqual([]);
  });
});
