import { describe, it, expect } from 'vitest';
import { normalizarNombreModelo, sugerirCarpetas } from './modelos';

describe('normalizarNombreModelo', () => {
  it('unifica cualquier forma de mayúsculas/minúsculas de un modelo de catálogo en su nombre canónico', () => {
    expect(normalizarNombreModelo('iphone 13 pro')).toBe('iPhone 13 Pro');
    expect(normalizarNombreModelo('IPHONE 13 PRO')).toBe('iPhone 13 Pro');
    expect(normalizarNombreModelo('iPhone 13 pro')).toBe('iPhone 13 Pro');
    expect(normalizarNombreModelo('iphone 13 PRO max')).toBe('iPhone 13 Pro Max');
  });

  it('respeta la capitalización canónica del catálogo aunque no sea "primera letra mayúscula" (mini, siglas)', () => {
    expect(normalizarNombreModelo('iphone 13 mini')).toBe('iPhone 13 mini');
    expect(normalizarNombreModelo('IPHONE 13 MINI')).toBe('iPhone 13 mini');
    expect(normalizarNombreModelo('iphone xs max')).toBe('iPhone XS Max');
    expect(normalizarNombreModelo('iphone se (2022)')).toBe('iPhone SE (2022)');
  });

  it('normaliza otras marcas del catálogo (Samsung, Xiaomi) igual que iPhone', () => {
    expect(normalizarNombreModelo('galaxy s21 fe')).toBe('Galaxy S21 FE');
    expect(normalizarNombreModelo('GALAXY Z FOLD 3')).toBe('Galaxy Z Fold 3');
    expect(normalizarNombreModelo('redmi note 12 pro')).toBe('Redmi Note 12 Pro');
  });

  it('colapsa espacios de más y bordes antes de comparar contra el catálogo', () => {
    expect(normalizarNombreModelo('  iphone   13   pro  ')).toBe('iPhone 13 Pro');
  });

  it('para texto fuera del catálogo, solo corrige "iPhone" y deja el resto tal cual', () => {
    expect(normalizarNombreModelo('televisor 32 pulgadas')).toBe('televisor 32 pulgadas');
    expect(normalizarNombreModelo('iphone reacondicionado')).toBe('iPhone reacondicionado');
    expect(normalizarNombreModelo('Heladera 4K')).toBe('Heladera 4K');
  });
});

describe('sugerirCarpetas', () => {
  it('sigue detectando que un texto parcial ya está cubierto por una carpeta existente, sin importar el casing', () => {
    expect(sugerirCarpetas('13 pro', ['iPhone 13 Pro'])).toEqual(['iPhone 13 Pro']);
  });

  it('no sugiere nada si ya hay una coincidencia exacta (por casing normalizado)', () => {
    expect(sugerirCarpetas('iphone 13 pro', ['iPhone 13 Pro'])).toEqual([]);
  });
});
