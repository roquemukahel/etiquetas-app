import { describe, expect, it } from 'vitest';
import { montosPorRubro, pagoDeCompra, validarReparto } from './rubrosCompra';

describe('validarReparto', () => {
  it('exige al menos un rubro y que cada línea tenga el suyo', () => {
    expect(validarReparto([], 100)).toMatch(/rubro/);
    expect(validarReparto([{ categoriaId: '', monto: '' }], 100)).toMatch(/rubro/);
  });
  it('un solo rubro lleva todo el total, sin pedir monto', () => {
    expect(validarReparto([{ categoriaId: 'a', monto: '' }], 100)).toBeNull();
  });
  it('varios rubros: cada monto > 0 y la suma tiene que dar el total', () => {
    expect(validarReparto([{ categoriaId: 'a', monto: '60' }, { categoriaId: 'b', monto: '40' }], 100)).toBeNull();
    expect(validarReparto([{ categoriaId: 'a', monto: '60' }, { categoriaId: 'b', monto: '30' }], 100)).toMatch(/sumar/);
    expect(validarReparto([{ categoriaId: 'a', monto: '100' }, { categoriaId: 'b', monto: '0' }], 100)).toMatch(/mayor a 0/);
  });
});

describe('montosPorRubro', () => {
  it('una línea toma el total; varias usan sus montos', () => {
    expect(montosPorRubro([{ categoriaId: 'a', monto: '' }], 250)).toEqual([{ categoriaId: 'a', monto: 250 }]);
    expect(montosPorRubro([{ categoriaId: 'a', monto: '100' }, { categoriaId: 'b', monto: '150' }], 250)).toEqual([
      { categoriaId: 'a', monto: 100 },
      { categoriaId: 'b', monto: 150 },
    ]);
  });
});

describe('pagoDeCompra', () => {
  it('sin deuda: se paga todo', () => {
    expect(pagoDeCompra(1000, null)).toEqual({ pagado: 1000 });
  });
  it('quedé debiendo X: se paga el resto', () => {
    expect(pagoDeCompra(1000, '300')).toEqual({ pagado: 700 });
    expect(pagoDeCompra(1000, '1000')).toEqual({ pagado: 0 });
  });
  it('rechaza una deuda vacía, cero o mayor al total', () => {
    expect(pagoDeCompra(1000, '')).toHaveProperty('error');
    expect(pagoDeCompra(1000, '0')).toHaveProperty('error');
    expect(pagoDeCompra(1000, '1500')).toHaveProperty('error');
  });
});
