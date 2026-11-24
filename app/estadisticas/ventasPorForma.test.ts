import { describe, expect, it } from 'vitest';
import { desgloseDeVentas, gananciaCobradaEnPeriodo, repartirVenta } from './ventasPorForma';
import type { ItemR, OrdenR, PagoR } from './datos';

const desde = new Date(2026, 10, 1);
const hasta = new Date(2026, 10, 30, 23, 59, 59);
const dia = (d: number) => new Date(2026, 10, d, 12).toISOString();
const orden = (id: string, total: number, extra: Partial<OrdenR> = {}): OrdenR => ({
  id,
  vendedor_id: null,
  cliente_id: null,
  total,
  anticipo: 0,
  monto_canje: 0,
  estado: 'pagado',
  forma_pago: null,
  created_at: dia(10),
  sucursal_id: null,
  ...extra,
});
const items = (id: string, precio: number, costo: number | null): Map<string, ItemR[]> =>
  new Map([[id, [{ orden_id: id, cantidad: 1, precio_unitario: precio, costo, tipo: 'producto' }]]]);

describe('reparto del valor de una venta', () => {
  it('las cuatro partes suman exactamente el valor', () => {
    const p = repartirVenta(1000, 600, 100, 150);
    expect(p).toEqual({ financiado: 600, cuentaCorriente: 100, tarjeta: 150, contado: 150 });
    expect(p.financiado + p.cuentaCorriente + p.tarjeta + p.contado).toBe(1000);
  });
  it('lo que sobra de lo declarado no se inventa: nunca pasa del valor', () => {
    const p = repartirVenta(100, 500, 80, 60);
    expect(p).toEqual({ financiado: 100, cuentaCorriente: 0, tarjeta: 0, contado: 0 });
  });
  it('una venta sin financiación ni deuda ni tarjeta es toda contado', () => {
    expect(repartirVenta(250, 0, 0, 0)).toEqual({ financiado: 0, cuentaCorriente: 0, tarjeta: 0, contado: 250 });
  });
});

describe('ventas del período por forma de cobro', () => {
  it('una venta financiada en cuotas ya no queda dentro de "contado"', () => {
    const ordenes = [orden('o1', 1200), orden('o2', 300)];
    const planes = [{ orden_id: 'o1', importe_financiado: 1000, estado: 'activo' }];
    const r = desgloseDeVentas(ordenes, new Map(), planes, [], [], desde, hasta);
    expect(r.ventas).toMatchObject({ financiado: 1000, contado: 500, tarjeta: 0, cuentaCorriente: 0, total: 1500 });
  });
  it('separa cuenta corriente (fiado) y tarjeta', () => {
    const ordenes = [orden('o1', 500), orden('o2', 400)];
    const cargos = [{ orden_id: 'o1', tipo: 'cargo', concepto: 'venta', monto: 500 }];
    const pagos: PagoR[] = [{ medio: 'debito', monto: 300, fecha: dia(10), orden_id: 'o2' }, { medio: 'efectivo', monto: 100, fecha: dia(10), orden_id: 'o2' }];
    const r = desgloseDeVentas(ordenes, new Map(), [], cargos, pagos, desde, hasta);
    expect(r.ventas).toMatchObject({ cuentaCorriente: 500, tarjeta: 300, contado: 100, financiado: 0, total: 900 });
  });
  it('un plan reprogramado o anulado no cuenta como financiado', () => {
    const planes = [
      { orden_id: 'o1', importe_financiado: 800, estado: 'reprogramado' },
      { orden_id: 'o1', importe_financiado: 800, estado: 'activo' },
      { orden_id: 'o1', importe_financiado: 500, estado: 'anulado' },
    ];
    expect(desgloseDeVentas([orden('o1', 1000)], new Map(), planes, [], [], desde, hasta).ventas.financiado).toBe(800);
  });
  it('no cuenta órdenes canceladas ni de otro período', () => {
    const ordenes = [orden('o1', 100, { estado: 'cancelado' }), orden('o2', 200, { created_at: new Date(2026, 9, 1).toISOString() })];
    expect(desgloseDeVentas(ordenes, new Map(), [], [], [], desde, hasta).ventas.total).toBe(0);
  });
  it('el valor de la venta incluye el anticipo y el equipo de canje (como en Ventas netas)', () => {
    const r = desgloseDeVentas([orden('o1', 700, { anticipo: 200, monto_canje: 100 })], new Map(), [], [], [], desde, hasta);
    expect(r.ventas.total).toBe(1000);
  });
});

describe('ganancia según cómo se cobra', () => {
  it('la ganancia de una venta financiada se muestra aparte, proporcional a lo financiado', () => {
    // venta de 1000 con costo 600 (ganancia 400): 750 financiado, 250 contado → 300 financiada y 100 al contado
    const r = desgloseDeVentas([orden('o1', 1000)], items('o1', 1000, 600), [{ orden_id: 'o1', importe_financiado: 750, estado: 'activo' }], [], [], desde, hasta);
    expect(r.ganancia.financiado).toBeCloseTo(300, 6);
    expect(r.ganancia.contado).toBeCloseTo(100, 6);
    expect(r.ganancia.total).toBe(400);
    expect(r.ganancia.contado + r.ganancia.financiado + r.ganancia.cuentaCorriente).toBeCloseTo(r.ganancia.total, 6);
  });
  it('una venta al contado aporta toda su ganancia como contado', () => {
    const r = desgloseDeVentas([orden('o1', 500)], items('o1', 500, 350), [], [], [], desde, hasta);
    expect(r.ganancia).toMatchObject({ contado: 150, financiado: 0, cuentaCorriente: 0, total: 150 });
  });
});

describe('ganancia efectivamente cobrada en el período', () => {
  it('una venta al contado pagada entera cuenta toda su ganancia', () => {
    const pagos: PagoR[] = [{ medio: 'efectivo', monto: 500, fecha: dia(10), orden_id: 'o1' }];
    expect(gananciaCobradaEnPeriodo([orden('o1', 500)], items('o1', 500, 350), pagos, [], desde, hasta)).toBeCloseTo(150, 6);
  });
  it('una venta financiada aporta solo la parte de las cuotas cobradas en el período', () => {
    // ganancia 400 sobre una venta de 1200; en el período se cobró la cuota 1 de 200 → 400 × 200/1200
    const cuotas = [{ orden_id: 'o1', monto_aplicado: 200, created_at: dia(10) }];
    expect(gananciaCobradaEnPeriodo([orden('o1', 1200)], items('o1', 1200, 800), [], cuotas, desde, hasta)).toBeCloseTo(400 * (200 / 1200), 6);
  });
  it('una venta de un mes anterior suma en este mes lo que se cobró de sus cuotas ahora', () => {
    const vieja = orden('o1', 1200, { created_at: new Date(2026, 8, 5).toISOString() });
    const cuotas = [
      { orden_id: 'o1', monto_aplicado: 200, created_at: new Date(2026, 8, 5).toISOString() }, // septiembre: no cuenta acá
      { orden_id: 'o1', monto_aplicado: 200, created_at: dia(8) }, // noviembre: sí
    ];
    expect(gananciaCobradaEnPeriodo([vieja], items('o1', 1200, 800), [], cuotas, desde, hasta)).toBeCloseTo(400 * (200 / 1200), 6);
  });
  it('el anticipo y el canje se cobran el día de la venta', () => {
    const o = orden('o1', 500, { anticipo: 300, monto_canje: 200 }); // valor 1000
    expect(gananciaCobradaEnPeriodo([o], items('o1', 1000, 600), [], [], desde, hasta)).toBeCloseTo(400 * (500 / 1000), 6);
  });
  it('nunca cuenta más ganancia que la que tiene la venta', () => {
    const pagos: PagoR[] = [{ medio: 'efectivo', monto: 5000, fecha: dia(10), orden_id: 'o1' }];
    expect(gananciaCobradaEnPeriodo([orden('o1', 500)], items('o1', 500, 350), pagos, [], desde, hasta)).toBeCloseTo(150, 6);
  });
  it('un equipo entregado como pago (medio canje) no es plata cobrada', () => {
    const pagos: PagoR[] = [{ medio: 'canje', monto: 500, fecha: dia(10), orden_id: 'o1' }];
    expect(gananciaCobradaEnPeriodo([orden('o1', 500)], items('o1', 500, 350), pagos, [], desde, hasta)).toBe(0);
  });
});
