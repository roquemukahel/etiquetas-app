import { describe, expect, it } from 'vitest';
import {
  calcularPlan,
  capitalEnLaCalle,
  grupoDeVenta,
  moraPorTramo,
  otorgadosEnPeriodo,
  porcentajeRecupero,
  proyeccionCobranzas,
  recuperoEnPeriodo,
  retornoPorMesDeOriginacion,
  tiempoPromedioRecupero,
  type CuotaIn,
  type InfoPlanIn,
  type PagoIn,
  type PlanIn,
} from './cartera';

const plan = (extra: Partial<PlanIn> = {}): PlanIn => ({
  id: 'p1',
  cliente_id: 'c1',
  orden_id: 'o1',
  moneda: 'ARS',
  importe_financiado: 1200,
  entrega_inicial: 0,
  cantidad_cuotas: 4,
  estado: 'activo',
  created_at: '2026-08-01T15:00:00.000Z',
  ...extra,
});
const info = (extra: Partial<InfoPlanIn> = {}): InfoPlanIn => ({ costo: 800, costoCompleto: true, cobradoInicial: 0, sucursal_id: null, categorias: ['Celulares'], localidad: null, ...extra });
// 4 cuotas de 300; vencen el día de la venta y cada mes
const cuotas = (pagadas: number[] = []): CuotaIn[] =>
  ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'].map((f, i) => ({
    plan_id: 'p1',
    fecha_vencimiento: f,
    importe_original: 300,
    importe_pagado: pagadas.includes(i) ? 300 : 0,
    estado: pagadas.includes(i) ? 'pagada' : 'pendiente',
  }));
const pago = (monto: number, fecha: string): PagoIn => ({ plan_id: 'p1', monto, fecha });

describe('regla de recupero: lo cobrado recupera primero el costo', () => {
  it('con la cuota 1 cobrada el día de la venta (sin anticipo) ya hay capital recuperado desde el día 1', () => {
    const p = calcularPlan(plan(), cuotas([0]), [pago(300, '2026-08-01T15:05:00.000Z')], info());
    expect(p.cobrado).toBe(300);
    expect(p.capitalRecuperado).toBe(300);
    expect(p.gananciaCobrada).toBe(0);
    expect(p.estado).toBe('recuperando');
    expect(p.faltaCobrar).toBe(900);
  });

  it('lo que supera el costo es ganancia cobrada, y el estado pasa a "costo recuperado / en ganancia"', () => {
    const pagos = [pago(300, '2026-08-01T15:05:00.000Z'), pago(300, '2026-09-01T12:00:00.000Z'), pago(300, '2026-10-01T12:00:00.000Z')];
    const p = calcularPlan(plan(), cuotas([0, 1, 2]), pagos, info()); // costo 800, cobrado 900
    expect(p.capitalRecuperado).toBe(800);
    expect(p.gananciaCobrada).toBe(100);
    expect(p.estado).toBe('ganancia');
    // la ganancia total esperada es 1200 - 800 = 400; ya se cobró 100
    expect(p.gananciaPendiente).toBe(300);
  });

  it('un cobro que cruza el costo se reparte entre capital y ganancia', () => {
    const pagos = [pago(300, '2026-08-01T15:05:00.000Z'), pago(300, '2026-09-01T12:00:00.000Z'), pago(300, '2026-10-01T12:00:00.000Z')];
    const p = calcularPlan(plan(), cuotas([0, 1, 2]), pagos, info());
    expect(p.eventos.map((e) => [e.capital, e.ganancia])).toEqual([
      [300, 0],
      [300, 0],
      [200, 100], // el tercero completa los 800 de costo y 100 ya es ganancia
    ]);
  });

  it('un anticipo cobrado en la venta cuenta como cobrado desde el primer día', () => {
    const p = calcularPlan(plan(), cuotas(), [], info({ cobradoInicial: 500 }));
    expect(p.cobrado).toBe(500);
    expect(p.capitalRecuperado).toBe(500);
  });

  it('crédito anulado = cancelado; sin costo cargado no se inventa ganancia', () => {
    expect(calcularPlan(plan({ estado: 'anulado' }), cuotas(), [], info()).estado).toBe('cancelado');
    const sinCosto = calcularPlan(plan(), cuotas([0]), [pago(300, '2026-08-01T15:05:00.000Z')], info({ costo: 0 }));
    expect(sinCosto.estado).toBe('sin_costo');
    expect(sinCosto.costoConocido).toBe(false);
  });

  it('cuándo se recupera el costo y cuántos días tardó', () => {
    const pagos = [pago(300, '2026-08-01T15:05:00.000Z'), pago(300, '2026-09-01T12:00:00.000Z'), pago(300, '2026-10-01T12:00:00.000Z')];
    const p = calcularPlan(plan(), cuotas([0, 1, 2]), pagos, info());
    expect(p.fechaRecuperoCosto).toBe('2026-10-01T12:00:00.000Z');
    expect(p.diasParaRecuperar).toBe(61);
  });
});

describe('agregados de la cartera', () => {
  const pagosA = [pago(300, '2026-08-01T15:05:00.000Z'), pago(300, '2026-09-01T12:00:00.000Z')];
  const a = calcularPlan(plan(), cuotas([0, 1]), pagosA, info()); // costo 800, cobrado 600 → recuperando
  const b = calcularPlan(
    plan({ id: 'p2', created_at: '2026-09-05T15:00:00.000Z' }),
    cuotas([]).map((c) => ({ ...c, plan_id: 'p2' })),
    [],
    info({ costo: 1000 })
  );
  const cancelado = calcularPlan(plan({ id: 'p3', estado: 'anulado' }), cuotas().map((c) => ({ ...c, plan_id: 'p3' })), [], info({ costo: 500 }));

  it('capital en la calle = costo todavía no recuperado de los créditos vigentes', () => {
    expect(capitalEnLaCalle([a, b, cancelado])).toBe(200 + 1000);
  });
  it('porcentaje de recupero de la cartera', () => {
    // recuperado 600 de 1800 invertidos
    expect(porcentajeRecupero([a, b, cancelado])).toBeCloseTo(33.33, 1);
    expect(porcentajeRecupero([])).toBeNull();
  });
  it('lo recuperado y la ganancia cobrada en un período', () => {
    const septiembre = recuperoEnPeriodo([a, b], new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z'));
    expect(septiembre).toEqual({ capital: 300, ganancia: 0, total: 300 });
  });
  it('créditos otorgados en el período (sin contar los cancelados)', () => {
    const r = otorgadosEnPeriodo([a, b, cancelado], new Date('2026-08-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z'));
    expect(r).toEqual({ cantidad: 2, financiado: 2400, costo: 1800 });
  });
  it('tiempo promedio en recuperar el costo: solo cuenta los que ya lo recuperaron', () => {
    expect(tiempoPromedioRecupero([a, b])).toBeNull();
    const rec = calcularPlan(plan(), cuotas([0, 1, 2]), [pago(300, '2026-08-01T15:05:00.000Z'), pago(300, '2026-08-11T12:00:00.000Z'), pago(300, '2026-08-21T12:00:00.000Z')], info());
    expect(tiempoPromedioRecupero([rec, a])?.creditos).toBe(1);
  });
  it('mora por tramo de días de atraso', () => {
    // hoy = 2026-11-15: cuota 10/01 con 45 días, la 09/01 con 75 (a: pagó 0 y 1 → debe 10/01 y 11/01)
    const m = moraPorTramo([a], '2026-11-15');
    expect(m.total).toBe(600); // 10/01 (45 días) y 11/01 (14 días)
    expect(m.tramos.find((t) => t.tramo === '1-30')).toMatchObject({ monto: 300, cuotas: 1 });
    expect(m.tramos.find((t) => t.tramo === '31-60')).toMatchObject({ monto: 300, cuotas: 1 });
    expect(m.maxDias).toBe(45);
    const sinPagos = moraPorTramo([b], '2026-11-15');
    expect(sinPagos.tramos.find((t) => t.tramo === '60+')?.cuotas).toBe(2); // 08/01 y 09/01
  });
  it('retorno por mes de originación', () => {
    const r = retornoPorMesDeOriginacion([a, b, cancelado]);
    expect(r.map((f) => f.mes)).toEqual(['2026-09', '2026-08']);
    const ago = r.find((f) => f.mes === '2026-08')!;
    expect(ago).toMatchObject({ creditos: 1, invertido: 800, recuperado: 600, gananciaCobrada: 0 });
    expect(ago.pctRecuperado).toBe(75);
  });
  it('proyección de cobranzas a 30/60/90 días', () => {
    // hoy = 2026-10-15: a debe 10/01 (vencida), 11/01 (17 días → 30d)
    const r = proyeccionCobranzas([a], '2026-10-15');
    expect(r).toEqual({ vencido: 300, d30: 300, d60: 0, d90: 0 });
  });
});

describe('ventas: pago exclusivo vs financiado', () => {
  it('con plan de cuotas propias es financiado, sin importar cómo se anotó el pago', () => {
    expect(grupoDeVenta('Cuenta corriente', true)).toBe('financiado');
    expect(grupoDeVenta('Efectivo', true)).toBe('financiado');
  });
  it('contado, transferencia o débito (solos o mezclados) es pago exclusivo', () => {
    expect(grupoDeVenta('Efectivo', false)).toBe('exclusivo');
    expect(grupoDeVenta('Efectivo + Transferencia', false)).toBe('exclusivo');
    expect(grupoDeVenta('Débito', false)).toBe('exclusivo');
    expect(grupoDeVenta('Transferencia + Debito', false)).toBe('exclusivo');
  });
  it('crédito de tarjeta, cuenta corriente sin plan o sin dato va a "otros"', () => {
    expect(grupoDeVenta('Crédito', false)).toBe('otros');
    expect(grupoDeVenta('Efectivo + Cuenta corriente', false)).toBe('otros');
    expect(grupoDeVenta(null, false)).toBe('otros');
  });
});
