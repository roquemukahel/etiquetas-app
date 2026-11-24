import { describe, expect, it } from 'vitest';
import { OPCIONES_ALMACENAMIENTO, extraerCapacidadGB, formatearGB } from './almacenamiento';

describe('almacenamiento', () => {
  it('ofrece hasta 2 TB', () => {
    expect(OPCIONES_ALMACENAMIENTO).toEqual([64, 128, 256, 512, 1024, 2048]);
  });
  it('muestra TB solo cuando son exactos', () => {
    expect(formatearGB(128)).toBe('128GB');
    expect(formatearGB(512, true)).toBe('512 GB');
    expect(formatearGB(1024)).toBe('1TB');
    expect(formatearGB(2048, true)).toBe('2 TB');
    expect(formatearGB(1536)).toBe('1536GB');
    expect(formatearGB('256')).toBe('256GB');
  });
  it('sin valor no muestra nada', () => {
    expect(formatearGB(null)).toBe('');
    expect(formatearGB(undefined)).toBe('');
    expect(formatearGB(0)).toBe('');
    expect(formatearGB('')).toBe('');
  });
  it('lee capacidades escritas en texto', () => {
    expect(extraerCapacidadGB('iPhone 15 Pro 256GB negro')).toBe(256);
    expect(extraerCapacidadGB('iPhone 16 Pro Max 1TB')).toBe(1024);
    expect(extraerCapacidadGB('iPhone 17 Pro Max 2 TB')).toBe(2048);
    expect(extraerCapacidadGB('1,5 TB')).toBe(1536);
    expect(extraerCapacidadGB('sin capacidad')).toBeNull();
  });
});
