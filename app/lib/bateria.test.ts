import { describe, expect, it } from 'vitest';
import { extraerBateriaDeDetalles, parsearBateria, soloPorcentajeBateria } from './bateria';

describe('campo de batería', () => {
  it('deja solo dígitos, hasta 3, y no pasa de 100', () => {
    expect(soloPorcentajeBateria('87')).toBe('87');
    expect(soloPorcentajeBateria('87%')).toBe('87');
    expect(soloPorcentajeBateria('abc')).toBe('');
    expect(soloPorcentajeBateria('1000')).toBe('100');
    expect(soloPorcentajeBateria('250')).toBe('100');
    expect(soloPorcentajeBateria('')).toBe('');
  });
  it('guarda un entero de 1 a 100 y nada más', () => {
    expect(parsearBateria('87')).toBe(87);
    expect(parsearBateria(' 100 ')).toBe(100);
    expect(parsearBateria('1')).toBe(1);
    expect(parsearBateria('0')).toBeNull();
    expect(parsearBateria('101')).toBeNull();
    expect(parsearBateria('')).toBeNull();
    expect(parsearBateria(null)).toBeNull();
    expect(parsearBateria('87,5')).toBeNull();
  });
});

describe('batería escrita en los detalles', () => {
  it('encuentra las formas de escribirla más comunes', () => {
    expect(extraerBateriaDeDetalles('pantalla con manchas, batería al 70%')).toBe(70);
    expect(extraerBateriaDeDetalles('Bateria 87')).toBe(87);
    expect(extraerBateriaDeDetalles('batería: 91%')).toBe(91);
    expect(extraerBateriaDeDetalles('87% de batería, sin caja')).toBe(87);
    expect(extraerBateriaDeDetalles('100% de bateria')).toBe(100);
    expect(extraerBateriaDeDetalles('Salud de batería 89%')).toBe(89);
    expect(extraerBateriaDeDetalles('salud 91%')).toBe(91);
    expect(extraerBateriaDeDetalles('bat 85%')).toBe(85);
    expect(extraerBateriaDeDetalles('bat. al 80')).toBe(80);
  });
  it('si hay varias toma la primera', () => {
    expect(extraerBateriaDeDetalles('batería 80% pantalla 95%')).toBe(80);
  });
  it('no inventa un porcentaje cuando no está claro', () => {
    expect(extraerBateriaDeDetalles('batería nueva')).toBeNull();
    expect(extraerBateriaDeDetalles('batería cambiada en 2024')).toBeNull();
    expect(extraerBateriaDeDetalles('batería al 120%')).toBeNull();
    expect(extraerBateriaDeDetalles('batería 3 meses de uso')).toBeNull();
    expect(extraerBateriaDeDetalles('pantalla rota, 128 GB')).toBeNull();
    expect(extraerBateriaDeDetalles('')).toBeNull();
    expect(extraerBateriaDeDetalles(null)).toBeNull();
  });
});
