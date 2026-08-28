import { describe, it, expect } from 'vitest';
import { totalesPorMedio, totalGeneral, efectivoEsperado, diferenciaArqueo, cajaDeVenta, type PagoParaCaja } from './motor';

describe('totalesPorMedio', () => {
  it('agrupa por medio y suma', () => {
    const pagos: PagoParaCaja[] = [
      { medio: 'efectivo', monto: 1000, moneda: 'ARS' },
      { medio: 'efectivo', monto: 500, moneda: 'ARS' },
      { medio: 'transferencia', monto: 2000, moneda: 'ARS' },
      { medio: 'debito', monto: 300, moneda: 'ARS' },
      { medio: 'credito', monto: 100, moneda: 'ARS' },
    ];
    expect(totalesPorMedio(pagos)).toEqual({ efectivo: 1500, transferencia: 2000, debito: 300, credito: 100, otro: 0 });
  });

  it('un medio desconocido (cheque/usdt) cae en "otro", no se pierde', () => {
    const pagos: PagoParaCaja[] = [{ medio: 'usdt', monto: 50, moneda: 'USD' }];
    expect(totalesPorMedio(pagos).otro).toBe(50);
  });

  it('lista vacía da todo en cero', () => {
    expect(totalesPorMedio([])).toEqual({ efectivo: 0, transferencia: 0, debito: 0, credito: 0, otro: 0 });
  });
});

describe('totalGeneral', () => {
  it('suma los 5 baldes', () => {
    expect(totalGeneral({ efectivo: 100, transferencia: 200, debito: 50, credito: 25, otro: 10 })).toBe(385);
  });
});

describe('efectivoEsperado / diferenciaArqueo', () => {
  it('esperado = inicial + efectivo del período', () => {
    expect(efectivoEsperado(5000, 12000)).toBe(17000);
  });
  it('diferencia positiva = sobra plata, negativa = falta', () => {
    expect(diferenciaArqueo(17500, 17000)).toBe(500);
    expect(diferenciaArqueo(16800, 17000)).toBe(-200);
    expect(diferenciaArqueo(17000, 17000)).toBe(0);
  });
});

describe('cajaDeVenta', () => {
  it('sin saldo a cuenta corriente → venta diaria', () => {
    expect(cajaDeVenta(0)).toBe('venta_diaria');
  });
  it('con saldo a cuenta corriente (con o sin cronograma propio) → financiamiento', () => {
    expect(cajaDeVenta(500)).toBe('financiamiento');
  });
  it('residuo de punto flotante despreciable no cuenta como saldo real', () => {
    expect(cajaDeVenta(0.001)).toBe('venta_diaria');
  });
});
