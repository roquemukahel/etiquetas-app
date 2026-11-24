import { describe, expect, it } from 'vitest';
import { cuotasEfectivasDeOrden, interesGuardadoDeOrden, type OrdenParaCuotas } from './cuotas';

const base: OrdenParaCuotas = {
  cuotas: 1,
  total: 500,
  anticipo: 0,
  monto_canje: 0,
  impuesto_porcentaje: 0,
  orden_items: [{ cantidad: 1, precio_unitario: 500 }],
};

describe('plan de cuotas de una orden ya guardada', () => {
  it('una orden en cuotas=1 por default (sin recargo) se lee como contado', () => {
    expect(interesGuardadoDeOrden(base)).toBe(0);
    expect(cuotasEfectivasDeOrden(base)).toBe(0);
  });

  it('una orden en 1 cuota CON recargo conserva su plan', () => {
    const orden = { ...base, total: 535 };
    expect(interesGuardadoDeOrden(orden)).toBe(7);
    expect(cuotasEfectivasDeOrden(orden)).toBe(1);
  });

  it('despeja el interés aunque haya impuesto, anticipo y canje', () => {
    // subtotal 1000 + 10% interés = 1100; +21% impuesto = 1331; - anticipo 100 - canje 200 = 1031
    const orden: OrdenParaCuotas = {
      cuotas: 3,
      total: 1031,
      anticipo: 100,
      monto_canje: 200,
      impuesto_porcentaje: 21,
      orden_items: [{ cantidad: 2, precio_unitario: 500 }],
    };
    expect(interesGuardadoDeOrden(orden)).toBe(10);
    expect(cuotasEfectivasDeOrden(orden)).toBe(3);
  });

  it('contado y órdenes sin precio base no tienen interés guardado', () => {
    expect(interesGuardadoDeOrden({ ...base, cuotas: 0 })).toBeNull();
    expect(interesGuardadoDeOrden({ ...base, cuotas: null })).toBeNull();
    expect(interesGuardadoDeOrden({ ...base, orden_items: [] })).toBeNull();
    expect(interesGuardadoDeOrden(null)).toBeNull();
    expect(cuotasEfectivasDeOrden(null)).toBe(0);
  });

  it('nunca devuelve interés negativo (total menor al precio por un descuento)', () => {
    expect(interesGuardadoDeOrden({ ...base, total: 450 })).toBe(0);
  });
});
