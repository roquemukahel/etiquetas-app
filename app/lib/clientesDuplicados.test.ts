import { describe, expect, it } from 'vitest';
import { encontrarDuplicados, mismoDni, mismoTelefono } from './clientesDuplicados';

const c = (id: string, nombre: string, dni: string | null, telefono: string | null) => ({ id, nombre, apellido: null, dni, telefono });

describe('duplicados de cliente', () => {
  it('el DNI coincide aunque venga con puntos o espacios', () => {
    expect(mismoDni('30.123.456', '30123456')).toBe(true);
    expect(mismoDni('30123456', '30123457')).toBe(false);
    expect(mismoDni('123', '123')).toBe(false); // demasiado corto para confiar
  });
  it('el teléfono coincide ignorando prefijos, 15, espacios y guiones', () => {
    expect(mismoTelefono('+54 9 381 509-0214', '3815090214')).toBe(true);
    expect(mismoTelefono('381 5090214', '381-4090214')).toBe(false);
    expect(mismoTelefono('12345', '12345')).toBe(false);
  });
  it('encuentra por DNI o por teléfono, y excluye al propio cliente', () => {
    const lista = [c('1', 'Ana', '30123456', null), c('2', 'Beto', null, '3815090214'), c('3', 'Cami', '99999999', '1111111111')];
    expect(encontrarDuplicados(lista, { dni: '30.123.456' })).toEqual([{ id: '1', nombre: 'Ana', motivo: 'DNI' }]);
    expect(encontrarDuplicados(lista, { telefono: '381-509-0214' })).toEqual([{ id: '2', nombre: 'Beto', motivo: 'teléfono' }]);
    expect(encontrarDuplicados(lista, { dni: '30123456' }, '1')).toEqual([]);
    expect(encontrarDuplicados(lista, {})).toEqual([]);
  });
});
