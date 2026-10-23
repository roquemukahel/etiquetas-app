import { describe, expect, it } from 'vitest';
import { topeParaCorregirPago } from './correccionPago';

describe('tope para corregir el monto de un pago', () => {
  it('pago de cuenta corriente sin cuotas: admite lo que el cliente todavía debe en cuenta corriente, más lo que ya pagó', () => {
    // debe $700 en total, $200 son de una cuota pendiente -> $500 de cuenta corriente pura; este pago fue de $300.
    expect(topeParaCorregirPago({ montoActual: 300, aplicaciones: [], cuotas: [], saldoCuenta: 700, saldoCuotasPendientes: 200 })).toBe(800);
  });
  it('si la cuenta ya estaba saldada, el tope es el monto actual (no se puede pagar de más)', () => {
    expect(topeParaCorregirPago({ montoActual: 300, aplicaciones: [], cuotas: [], saldoCuenta: 0, saldoCuotasPendientes: 0 })).toBe(300);
  });
  it('pago aplicado a una cuota: lo que a la cuota le falta más lo que este pago ya le había aplicado', () => {
    const tope = topeParaCorregirPago({
      montoActual: 50,
      aplicaciones: [{ cuota_id: 'c1', monto_aplicado: 50 }],
      cuotas: [{ id: 'c1', importe_original: 100, importe_pagado: 50 }],
      saldoCuenta: 400,
      saldoCuotasPendientes: 50,
    });
    expect(tope).toBe(100);
  });
  it('pago repartido en varias cuotas: sin tope fijo', () => {
    expect(
      topeParaCorregirPago({
        montoActual: 150,
        aplicaciones: [
          { cuota_id: 'a', monto_aplicado: 100 },
          { cuota_id: 'b', monto_aplicado: 50 },
        ],
        cuotas: [],
        saldoCuenta: 0,
        saldoCuotasPendientes: 0,
      })
    ).toBeNull();
  });
});
