import { describe, expect, it } from 'vitest';
import { lineasConPrecioAnormal, redondearMonto } from './montos';

describe('redondeo de montos', () => {
  it('deja los montos a centavos', () => {
    expect(redondearMonto(158.23000000000002)).toBe(158.23);
    expect(redondearMonto(0.1 + 0.2)).toBe(0.3);
    expect(redondearMonto(1234.5)).toBe(1234.5);
    expect(redondearMonto(100)).toBe(100);
  });
  it('no pierde el centavo por el ruido de la coma flotante (1,005 → 1,01)', () => {
    expect(redondearMonto(1.005)).toBe(1.01);
    expect(redondearMonto(2.675)).toBe(2.68);
  });
  it('varios productos con recargo no dejan un centavo de más', () => {
    const subtotal = 19.99 * 3 + 5.49 * 2 + 0.3; // 71,25 con ruido
    expect(redondearMonto(subtotal)).toBe(71.25);
    expect(redondearMonto(redondearMonto(subtotal) * 1.1)).toBe(78.38); // 71,25 + 10 % = 78,375 → 78,38
  });
  it('los negativos (saldo a favor) redondean simétricos', () => {
    expect(redondearMonto(-50.005)).toBe(-50.01);
    expect(redondearMonto(-0.1 - 0.2)).toBe(-0.3);
  });
  it('un valor que no es número da 0', () => {
    expect(redondearMonto(Number.NaN)).toBe(0);
    expect(redondearMonto(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('aviso de precios anormales', () => {
  it('avisa cuando el precio es varias veces el de lista (cero de más)', () => {
    const r = lineasConPrecioAnormal([{ descripcion: 'iPhone 13', cantidad: 1, precioUnitario: 4500, precioExclusivo: 450, precioLista: 480 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ descripcion: 'iPhone 13', precio: 4500, referencia: 480 });
    expect(r[0].veces).toBeCloseTo(9.375, 3);
  });
  it('un precio razonable, aunque cambie un poco, no avisa', () => {
    expect(lineasConPrecioAnormal([{ descripcion: 'Funda', cantidad: 1, precioUnitario: 12, precioExclusivo: 10, precioLista: 11 }])).toEqual([]);
    expect(lineasConPrecioAnormal([{ descripcion: 'Funda', cantidad: 1, precioUnitario: 30, precioExclusivo: 10, precioLista: 10 }])).toEqual([]); // justo 3×: no pasa
  });
  it('un precio más bajo (descuento) no avisa', () => {
    expect(lineasConPrecioAnormal([{ descripcion: 'Cargador', cantidad: 1, precioUnitario: 1, precioExclusivo: 10, precioLista: 12 }])).toEqual([]);
  });
  it('sin precio de referencia (carga manual) no se puede comparar y no avisa', () => {
    expect(lineasConPrecioAnormal([{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 99999 }])).toEqual([]);
    expect(lineasConPrecioAnormal([{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 99999, precioExclusivo: null, precioLista: 0 }])).toEqual([]);
  });
  it('avisa solo de las líneas anormales', () => {
    const r = lineasConPrecioAnormal([
      { descripcion: 'A', cantidad: 1, precioUnitario: 100, precioLista: 100 },
      { descripcion: 'B', cantidad: 1, precioUnitario: 5000, precioLista: 50 },
    ]);
    expect(r.map((x) => x.descripcion)).toEqual(['B']);
  });
});
