import { describe, expect, it } from 'vitest';
import { fraccionCobrada, planearPorCobrado } from './cobrado';

describe('fracción cobrada de una venta financiada', () => {
  it('sin plan o con la venta sin financiar, se toma como cobrada entera', () => {
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 0, cuotas: [] })).toBe(1);
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 600, cuotas: [] })).toBe(1);
  });
  it('al vender, solo cuenta lo que no se financió', () => {
    const cuotas = [1, 2, 3].map(() => ({ importe_original: 200, importe_pagado: 0 }));
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 600, cuotas })).toBeCloseTo(0.4, 6);
  });
  it('cada cuota cobrada suma su parte de lo financiado', () => {
    const cuotas = [
      { importe_original: 200, importe_pagado: 200 },
      { importe_original: 200, importe_pagado: 100 },
      { importe_original: 200, importe_pagado: 0 },
    ];
    // financiado 600, cobrado 300/600 = 50% → 400 + 300 = 700 de 1000
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 600, cuotas })).toBeCloseTo(0.7, 6);
  });
  it('con todas las cuotas pagadas llega a 1 y nunca pasa de 1', () => {
    const cuotas = [{ importe_original: 500, importe_pagado: 900 }];
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 500, cuotas })).toBe(1);
  });
  it('una venta toda financiada empieza en 0', () => {
    expect(fraccionCobrada({ valorVenta: 1000, financiado: 1000, cuotas: [{ importe_original: 1000, importe_pagado: 0 }] })).toBe(0);
  });
});

describe('planear comisiones por lo cobrado', () => {
  const lineas = [{ lineaId: 'a', comisionTotal: 100, baseTotal: 1000 }];
  const clave = (id: string) => `O:${id}:V`;

  it('al vender genera la parte cobrada', () => {
    const r = planearPorCobrado({ lineas, fraccion: 0.4, existentes: [], claveBase: clave, decimales: 0 });
    expect(r).toEqual([{ lineaId: 'a', tipo: 'comision', comision: 40, base: 400, idempotencyKey: 'O:a:V' }]);
  });
  it('con una cuota más, genera solo la diferencia, con otra clave', () => {
    const r = planearPorCobrado({ lineas, fraccion: 0.7, existentes: [{ orden_item_id: 'a', comision: 40 }], claveBase: clave, decimales: 0 });
    expect(r).toEqual([{ lineaId: 'a', tipo: 'comision', comision: 30, base: 300, idempotencyKey: 'O:a:V:1' }]);
  });
  it('si no cambió nada, no genera nada (es idempotente)', () => {
    expect(planearPorCobrado({ lineas, fraccion: 0.4, existentes: [{ orden_item_id: 'a', comision: 40 }], claveBase: clave, decimales: 0 })).toEqual([]);
  });
  it('si se anuló un pago, genera una reversión por lo que ya no corresponde', () => {
    const r = planearPorCobrado({ lineas, fraccion: 0.4, existentes: [{ orden_item_id: 'a', comision: 40 }, { orden_item_id: 'a', comision: 30 }], claveBase: clave, decimales: 0 });
    expect(r).toEqual([{ lineaId: 'a', tipo: 'reversion', comision: -30, base: 300, idempotencyKey: null }]);
  });
  it('una reversión ya hecha cuenta como parte de lo existente', () => {
    const r = planearPorCobrado({
      lineas,
      fraccion: 0.7,
      existentes: [{ orden_item_id: 'a', comision: 70 }, { orden_item_id: 'a', comision: -30 }],
      claveBase: clave,
      decimales: 0,
    });
    expect(r).toEqual([{ lineaId: 'a', tipo: 'comision', comision: 30, base: 300, idempotencyKey: 'O:a:V:2' }]);
  });
  it('cuando se cobró todo, la suma de los movimientos es exactamente la comisión total', () => {
    let existentes: { orden_item_id: string | null; comision: number }[] = [];
    for (const f of [0.333, 0.666, 1]) {
      const r = planearPorCobrado({ lineas: [{ lineaId: 'a', comisionTotal: 100, baseTotal: 1000 }], fraccion: f, existentes, claveBase: clave, decimales: 0 });
      existentes = [...existentes, ...r.map((m) => ({ orden_item_id: m.lineaId, comision: m.comision }))];
    }
    expect(existentes.reduce((a, e) => a + e.comision, 0)).toBe(100);
  });
  it('líneas sin comisión no generan nada', () => {
    expect(planearPorCobrado({ lineas: [{ lineaId: 'a', comisionTotal: 0, baseTotal: 100 }], fraccion: 1, existentes: [], claveBase: clave, decimales: 0 })).toEqual([]);
  });
});
