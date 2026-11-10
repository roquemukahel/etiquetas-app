import { describe, expect, it } from 'vitest';
import type { OrdenR } from './datos';
import { gananciaPorFuente, gananciaPorFuenteMensual } from './gananciaPorFuente';
import { desgloseDeVentas } from './ventasPorForma';

const orden = (id: string, total: number, extra: Partial<OrdenR> = {}): OrdenR => ({
  id,
  vendedor_id: null,
  cliente_id: null,
  total,
  anticipo: 0,
  monto_canje: 0,
  estado: 'pagado',
  forma_pago: 'efectivo',
  created_at: '2026-10-15T12:00:00',
  ...extra,
});
const desde = new Date('2026-10-01T00:00:00');
const hasta = new Date('2026-10-31T23:59:59');

describe('ganancia por fuente', () => {
  it('una venta al contado de productos va entera a "Venta de productos"', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const g = gananciaPorFuente([orden('a', 1000)], items, [], [], [], [], 0, desde, hasta);
    expect(g.productos).toMatchObject({ facturado: 1000, costo: 600, ganancia: 400, cobrado: 1000, gananciaCobrada: 400 });
    expect(g.creditos.facturado).toBe(0);
    expect(g.total.ganancia).toBe(400);
  });

  it('una venta con parte financiada reparte facturado, costo y ganancia entre contado y créditos', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const g = gananciaPorFuente([orden('a', 1000)], items, [{ orden_id: 'a', importe_financiado: 600, estado: 'activo' }], [], [], [], 0, desde, hasta);
    expect(g.creditos).toMatchObject({ facturado: 600, costo: 360, ganancia: 240, cobrado: 0, gananciaCobrada: 0 });
    expect(g.productos).toMatchObject({ facturado: 400, costo: 240, ganancia: 160 });
  });

  it('en créditos separa la ganancia generada de la ya cobrada según las cuotas cobradas en el período', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const cuotas = [
      { orden_id: 'a', monto_aplicado: 300, created_at: '2026-10-20T10:00:00' },
      { orden_id: 'a', monto_aplicado: 100, created_at: '2026-09-20T10:00:00' }, // otro período: no cuenta
    ];
    const g = gananciaPorFuente([orden('a', 1000)], items, [{ orden_id: 'a', importe_financiado: 600, estado: 'activo' }], [], [], cuotas, 300, desde, hasta);
    expect(g.creditos.cobrado).toBe(300);
    expect(g.creditos.ganancia).toBe(240);
    expect(g.creditos.gananciaCobrada).toBeCloseTo(120, 5); // 240 × 300/600
  });

  it('una venta financiada de un mes anterior igual aporta ganancia cobrada cuando se cobra una cuota en este', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const vieja = orden('a', 1000, { created_at: '2026-07-10T12:00:00' });
    const cuotas = [{ orden_id: 'a', monto_aplicado: 150, created_at: '2026-10-05T10:00:00' }];
    const g = gananciaPorFuente([vieja], items, [{ orden_id: 'a', importe_financiado: 600, estado: 'activo' }], [], [], cuotas, 150, desde, hasta);
    expect(g.creditos.facturado).toBe(0); // la venta es de julio
    expect(g.creditos.ganancia).toBe(0);
    expect(g.creditos.cobrado).toBe(150);
    expect(g.creditos.gananciaCobrada).toBeCloseTo(60, 5); // 240 × 150/600
  });

  it('el fiado es lo vendido a cuenta corriente; lo cobrado son las cobranzas que no fueron cuotas', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 2, precio_unitario: 500, costo: 200, tipo: 'producto' }]]]);
    const cargos = [{ orden_id: 'a', tipo: 'cargo', concepto: 'venta', monto: 1000 }];
    const g = gananciaPorFuente([orden('a', 1000)], items, [], cargos, [], [], 400, desde, hasta);
    expect(g.fiado).toMatchObject({ facturado: 1000, costo: 400, ganancia: 600, cobrado: 400, gananciaCobrada: null });
    expect(g.productos.facturado).toBe(0);
  });

  it('el servicio técnico (líneas de taller) va aparte, sin importar cómo se cobró', () => {
    const items = new Map([
      [
        'a',
        [
          { orden_id: 'a', cantidad: 1, precio_unitario: 500, costo: 300, tipo: 'producto' },
          { orden_id: 'a', cantidad: 1, precio_unitario: 200, costo: null, tipo: 'trabajo' },
        ],
      ],
    ]);
    const g = gananciaPorFuente([orden('a', 700)], items, [], [], [], [], 0, desde, hasta);
    expect(g.servicio).toMatchObject({ facturado: 200, costo: 0, ganancia: 200, cobrado: 200 });
    expect(g.productos).toMatchObject({ facturado: 500, costo: 300, ganancia: 200 });
    expect(g.total.facturado).toBe(700);
  });

  it('el facturado de las cuatro fuentes suma las ventas netas del período (mismo reparto que "ventas según cómo se cobran")', () => {
    const items = new Map([
      ['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]],
      ['b', [{ orden_id: 'b', cantidad: 3, precio_unitario: 100, costo: 50, tipo: 'producto' }, { orden_id: 'b', cantidad: 1, precio_unitario: 80, costo: null, tipo: 'trabajo' }]],
    ]);
    const ordenes = [orden('a', 900, { anticipo: 100 }), orden('b', 380)];
    const planes = [{ orden_id: 'a', importe_financiado: 500, estado: 'activo' }];
    const cargos = [{ orden_id: 'b', tipo: 'cargo', concepto: 'venta', monto: 100 }];
    const g = gananciaPorFuente(ordenes, items, planes, cargos, [], [], 0, desde, hasta);
    const d = desgloseDeVentas(ordenes, items, planes, cargos, [], desde, hasta);
    expect(g.total.facturado).toBeCloseTo(d.ventas.total, 5);
    expect(g.creditos.facturado).toBeCloseTo(d.ventas.financiado, 5);
  });

  it('ignora las ventas de otro período y las que no están cobradas', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const g = gananciaPorFuente([orden('a', 1000, { created_at: '2026-08-01T10:00:00' }), orden('a', 1000, { estado: 'pendiente' })], items, [], [], [], [], 0, desde, hasta);
    expect(g.total.facturado).toBe(0);
  });

  it('con filtro de sucursal, las cuotas cobradas cuentan solo si son de ventas de esa sucursal', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const cuotas = [
      { orden_id: 'a', monto_aplicado: 300, created_at: '2026-10-20T10:00:00' },
      { orden_id: 'otra-sucursal', monto_aplicado: 500, created_at: '2026-10-21T10:00:00' },
      { orden_id: null, monto_aplicado: 40, created_at: '2026-10-22T10:00:00' },
    ];
    const planes = [{ orden_id: 'a', importe_financiado: 600, estado: 'activo' }];
    const filtrado = gananciaPorFuente([orden('a', 1000)], items, planes, [], [], cuotas, 840, desde, hasta, true);
    expect(filtrado.creditos.cobrado).toBe(300);
    const todas = gananciaPorFuente([orden('a', 1000)], items, planes, [], [], cuotas, 840, desde, hasta, false);
    expect(todas.creditos.cobrado).toBe(840);
  });

  it('serie de 12 meses: un punto por mes, con la ganancia de cada fuente', () => {
    const items = new Map([['a', [{ orden_id: 'a', cantidad: 1, precio_unitario: 1000, costo: 600, tipo: 'producto' }]]]);
    const serie = gananciaPorFuenteMensual([orden('a', 1000)], items, [], [], [], [], new Date('2026-11-10T10:00:00'));
    expect(serie).toHaveLength(12);
    expect(serie[11].clave).toBe('2026-11');
    expect(serie[0].clave).toBe('2025-12');
    expect(serie.find((m) => m.clave === '2026-10')!.ganancia.productos).toBe(400);
    expect(serie.find((m) => m.clave === '2026-11')!.total).toBe(0);
  });
});
