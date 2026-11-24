import { describe, expect, it } from 'vitest';
import { etiquetaDeMedios, lineasCierranConElTotal, lineasIniciales, mediosDeEtiqueta, restanteDeLineas } from './formaPago';

describe('mediosDeEtiqueta / etiquetaDeMedios', () => {
  it('lee un medio simple', () => {
    expect(mediosDeEtiqueta('Efectivo')).toEqual(['efectivo']);
    expect(mediosDeEtiqueta('Débito')).toEqual(['debito']);
  });

  it('lee un pago mixto', () => {
    expect(mediosDeEtiqueta('Efectivo + Transferencia')).toEqual(['efectivo', 'transferencia']);
  });

  it("interpreta el valor viejo 'Tarjeta' como débito", () => {
    expect(mediosDeEtiqueta('Tarjeta')).toEqual(['debito']);
  });

  it('ignora textos desconocidos y vacíos', () => {
    expect(mediosDeEtiqueta('Mixto')).toEqual([]);
    expect(mediosDeEtiqueta(null)).toEqual([]);
    expect(mediosDeEtiqueta('')).toEqual([]);
  });

  it('reconoce cuenta corriente', () => {
    expect(mediosDeEtiqueta('Cuenta corriente')).toEqual(['cuenta_corriente']);
  });

  it('la etiqueta no depende del orden en que se eligieron los medios', () => {
    expect(etiquetaDeMedios(['transferencia', 'efectivo'])).toBe('Efectivo + Transferencia');
    expect(etiquetaDeMedios(['credito', 'debito', 'efectivo'])).toBe('Efectivo + Débito + Crédito');
  });

  it('ida y vuelta', () => {
    const etiqueta = etiquetaDeMedios(['efectivo', 'credito']);
    expect(mediosDeEtiqueta(etiqueta)).toEqual(['efectivo', 'credito']);
  });
});

describe('líneas de cobro', () => {
  it('el primer medio se queda con el total', () => {
    expect(lineasIniciales(['efectivo', 'transferencia'], 1000)).toEqual([
      { medio: 'efectivo', monto: '1000' },
      { medio: 'transferencia', monto: '' },
    ]);
  });

  it('sin medios arranca en efectivo', () => {
    expect(lineasIniciales([], 50)).toEqual([{ medio: 'efectivo', monto: '50' }]);
  });

  it('cierra con el total aunque haya centavos de diferencia por redondeo', () => {
    expect(lineasCierranConElTotal([{ medio: 'efectivo', monto: '600.005' }, { medio: 'transferencia', monto: '399.995' }], 1000)).toBe(true);
  });

  it('detecta lo que falta y lo que sobra', () => {
    expect(restanteDeLineas([{ medio: 'efectivo', monto: '600' }], 1000)).toBe(400);
    expect(restanteDeLineas([{ medio: 'efectivo', monto: '1200' }], 1000)).toBe(-200);
    expect(lineasCierranConElTotal([{ medio: 'efectivo', monto: '600' }], 1000)).toBe(false);
  });
});
