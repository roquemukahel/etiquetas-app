import { describe, it, expect } from 'vitest';
import { palabrasDeBusqueda, repuestosDisponibles } from './repuestosBusqueda';

const lista = [
  { nombre: 'Modulo Motorola g60s', calidad: 'Premium', cantidad_stock: 3, sucursal_id: 'A' },
  { nombre: 'Modulo Motorola g60s', calidad: 'Original', cantidad_stock: 0, sucursal_id: 'A' },
  { nombre: 'Bateria iPhone 11', calidad: null, cantidad_stock: 5, sucursal_id: 'B' },
  { nombre: 'Pin de carga universal', calidad: null, cantidad_stock: 2, sucursal_id: null },
];

describe('búsqueda de repuestos', () => {
  it('separa en palabras por espacios (no por la letra "s")', () => {
    expect(palabrasDeBusqueda('  modulo g60s premium ')).toEqual(['modulo', 'g60s', 'premium']);
    expect(palabrasDeBusqueda('')).toEqual([]);
  });
  it('encuentra por varias palabras sobre nombre + calidad', () => {
    expect(repuestosDisponibles(lista, 'modulo g60s premium', 'A')).toHaveLength(1);
    expect(repuestosDisponibles(lista, 'samsung', 'A')).toHaveLength(0);
  });
  it('no ofrece los que no tienen stock', () => {
    expect(repuestosDisponibles(lista, 'original', 'A')).toHaveLength(0);
  });
  it('filtra por la sucursal de la orden, pero el stock sin sucursal sirve en todas', () => {
    expect(repuestosDisponibles(lista, 'bateria', 'A')).toHaveLength(0);
    expect(repuestosDisponibles(lista, 'bateria', 'B')).toHaveLength(1);
    expect(repuestosDisponibles(lista, 'pin', 'A')).toHaveLength(1);
    expect(repuestosDisponibles(lista, 'bateria', null)).toHaveLength(1);
  });
  it('sin texto muestra todo lo que hay en la sucursal', () => {
    expect(repuestosDisponibles(lista, '', 'A')).toHaveLength(2);
  });
});
