import { describe, expect, it } from 'vitest';
import { ingresosEnEfectivo } from './ingresos';
import { efectivoEsperado } from './caja/motor';

describe('ingresos de capital y el arqueo de la caja', () => {
  it('solo el efectivo suma al cajón; transferencia, débito o crédito no', () => {
    expect(
      ingresosEnEfectivo([
        { medio_pago: 'efectivo', importe: 5000 },
        { medio_pago: 'transferencia', importe: 20000 },
        { medio_pago: 'efectivo', importe: 1500.5 },
        { medio_pago: 'debito', importe: 300 },
      ])
    ).toBe(6500.5);
    expect(ingresosEnEfectivo([])).toBe(0);
  });

  it('el efectivo esperado del turno incluye lo cobrado más el capital que entró en efectivo', () => {
    const cobrado = 12000;
    const capital = ingresosEnEfectivo([{ medio_pago: 'efectivo', importe: 8000 }]);
    expect(efectivoEsperado(15800, cobrado + capital)).toBe(35800);
  });
});
