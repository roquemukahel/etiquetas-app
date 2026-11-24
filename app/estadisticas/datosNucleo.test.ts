import { describe, expect, it } from 'vitest';
import {
  bloqueVentas,
  cobranzasDeCartera,
  idsOrdenesDeCobranza,
  montoVenta,
  rangoDe,
  serieEvolucion,
  variacion,
  type CreditoR,
  type ItemR,
  type OrdenR,
  type PagoR,
} from './datos';

// Núcleo de los números que ve el dueño (ventas, caja, evolución). serieEvolucion
// ya colgó el navegador una vez (cursor que no avanzaba) y montoVenta es lo que
// separa "Inicio" de "Estadísticas": estos casos fijan su comportamiento.
const orden = (extra: Partial<OrdenR> & Pick<OrdenR, 'id' | 'created_at'>): OrdenR => ({
  vendedor_id: null,
  cliente_id: null,
  total: 0,
  anticipo: 0,
  monto_canje: 0,
  estado: 'pagado',
  forma_pago: 'Efectivo',
  ...extra,
});

describe('montoVenta', () => {
  it('suma total + anticipo + canje (el total ya viene con eso descontado)', () => {
    expect(montoVenta({ total: 800, anticipo: 100, monto_canje: 100 })).toBe(1000);
  });
  it('trata null como 0', () => {
    expect(montoVenta({ total: null, anticipo: null, monto_canje: null })).toBe(0);
    expect(montoVenta({ total: 500, anticipo: null, monto_canje: null })).toBe(500);
  });
});

describe('variacion', () => {
  it('porcentaje contra el período anterior', () => {
    expect(variacion(150, 100)).toEqual({ pct: 50, abs: 50 });
    expect(variacion(50, 100)).toEqual({ pct: -50, abs: -50 });
  });
  it('anterior en cero: sin porcentaje (no "↑∞%")', () => {
    expect(variacion(10, 0)).toEqual({ pct: null, abs: 10 });
  });
});

describe('bloqueVentas', () => {
  const desde = new Date(2026, 9, 1, 0, 0, 0, 0);
  const hasta = new Date(2026, 9, 31, 23, 59, 59, 999);
  const dentro = new Date(2026, 9, 10, 12).toISOString();
  const fuera = new Date(2026, 8, 10, 12).toISOString();

  it('solo cuenta órdenes cobradas dentro del rango', () => {
    const ordenes = [
      orden({ id: 'a', created_at: dentro, total: 1000 }),
      orden({ id: 'b', created_at: dentro, total: 500, estado: 'cancelado' }),
      orden({ id: 'c', created_at: dentro, total: 300, estado: 'pendiente' }),
      orden({ id: 'd', created_at: fuera, total: 999 }),
      orden({ id: 'e', created_at: dentro, total: 200, estado: 'entregado' }),
    ];
    const r = bloqueVentas(ordenes, new Map(), [], [], desde, hasta);
    expect(r.ventas).toBe(1200);
    expect(r.operaciones).toBe(2);
  });

  it('ganancia solo sobre líneas con costo cargado; la cobertura se informa aparte', () => {
    const items = new Map<string, ItemR[]>([
      [
        'a',
        [
          { orden_id: 'a', cantidad: 2, precio_unitario: 100, costo: 60 },
          { orden_id: 'a', cantidad: 1, precio_unitario: 500, costo: null },
        ],
      ],
    ]);
    const r = bloqueVentas([orden({ id: 'a', created_at: dentro, total: 700 })], items, [], [], desde, hasta);
    expect(r.ganancia).toBe(80); // (100-60)*2, la línea sin costo no suma
    expect(r.ventasConCosto).toBe(200);
    expect(r.unidades).toBe(3);
  });

  it('una orden sin ítems cuenta como 1 unidad (fallback)', () => {
    const r = bloqueVentas([orden({ id: 'a', created_at: dentro, total: 10 })], new Map(), [], [], desde, hasta);
    expect(r.unidades).toBe(1);
  });

  it('caja = pagos del rango; crédito = solo cargos de venta a cuenta corriente', () => {
    const pagos: PagoR[] = [
      { medio: 'efectivo', monto: 400, fecha: dentro },
      { medio: 'transferencia', monto: 100, fecha: fuera },
    ];
    const credito: CreditoR[] = [
      { concepto: 'venta', tipo: 'cargo', monto: 300, fecha: dentro },
      { concepto: 'pago', tipo: 'abono', monto: 200, fecha: dentro },
      { concepto: 'venta', tipo: 'cargo', monto: 50, fecha: fuera },
    ];
    const r = bloqueVentas([], new Map(), pagos, credito, desde, hasta);
    expect(r.ingresado).toBe(400);
    expect(r.credito).toBe(300);
  });
});

describe('serieEvolucion', () => {
  const ahora = new Date(2026, 9, 15, 15, 0, 0, 0); // jueves 15/10/2026

  it('mes: un punto por día, termina (no cuelga) y suma cada venta en su día', () => {
    const rango = rangoDe('mes', ahora);
    const ordenes = [
      orden({ id: 'a', created_at: new Date(2026, 9, 1, 9).toISOString(), total: 100 }),
      orden({ id: 'b', created_at: new Date(2026, 9, 1, 20).toISOString(), total: 50 }),
      orden({ id: 'c', created_at: new Date(2026, 9, 15, 10).toISOString(), total: 70 }),
    ];
    const serie = serieEvolucion(ordenes, new Map(), [], [], rango, 'ventas');
    expect(serie).toHaveLength(15);
    expect(serie[0].actual).toBe(150);
    expect(serie[14].actual).toBe(70);
    expect(serie[1].actual).toBe(0);
  });

  it('año: un punto por mes hasta el actual', () => {
    const rango = rangoDe('anio', ahora);
    const serie = serieEvolucion(
      [orden({ id: 'a', created_at: new Date(2026, 0, 20).toISOString(), total: 10 }), orden({ id: 'b', created_at: new Date(2026, 9, 2).toISOString(), total: 5 })],
      new Map(),
      [],
      [],
      rango,
      'ventas'
    );
    expect(serie).toHaveLength(10);
    expect(serie[0].actual).toBe(10);
    expect(serie[9].actual).toBe(5);
  });

  it('hoy: 24 buckets por hora', () => {
    const rango = rangoDe('hoy', ahora);
    const serie = serieEvolucion([orden({ id: 'a', created_at: new Date(2026, 9, 15, 11, 30).toISOString(), total: 40 })], new Map(), [], [], rango, 'ventas');
    expect(serie).toHaveLength(24);
    expect(serie[11].actual).toBe(40);
  });

  it('métrica "ingresado" sale de los pagos, no de las órdenes', () => {
    const rango = rangoDe('mes', ahora);
    const pagos: PagoR[] = [{ medio: 'efectivo', monto: 90, fecha: new Date(2026, 9, 3, 12).toISOString() }];
    const serie = serieEvolucion([orden({ id: 'a', created_at: new Date(2026, 9, 3, 9).toISOString(), total: 1000 })], new Map(), pagos, [], rango, 'ingresado');
    expect(serie[2].actual).toBe(90);
  });

  it('la serie anterior queda alineada por posición con la actual', () => {
    const rango = rangoDe('mes', ahora);
    const septiembre = new Date(2026, 8, 1, 10).toISOString();
    const serie = serieEvolucion([orden({ id: 'a', created_at: septiembre, total: 33 })], new Map(), [], [], rango, 'ventas');
    expect(serie[0].anterior).toBe(33);
    expect(serie[0].actual).toBe(0);
  });
});

describe('cobranzas de cartera (cobrar una cuota no es una venta)', () => {
  const dentro = new Date(2026, 9, 10, 12).toISOString();
  const fuera = new Date(2026, 8, 10, 12).toISOString();
  const desde = new Date(2026, 9, 1, 0, 0, 0, 0);
  const hasta = new Date(2026, 9, 31, 23, 59, 59, 999);

  it('idsOrdenesDeCobranza: solo las órdenes cuyos ítems son TODOS de financiamiento', () => {
    const ids = idsOrdenesDeCobranza([
      { orden_id: 'cobro', tipo: 'financiamiento' },
      { orden_id: 'venta', tipo: 'dispositivo' },
      { orden_id: 'mixta', tipo: 'dispositivo' },
      { orden_id: 'mixta', tipo: 'financiamiento' },
      { orden_id: 'taller', tipo: 'trabajo' },
    ]);
    expect([...ids]).toEqual(['cobro']);
  });

  it('cobranzasDeCartera suma solo pagos de órdenes de cobranza dentro del rango y los reparte por quién cobró', () => {
    const ids = new Set(['c1', 'c2']);
    const pagos: PagoR[] = [
      { medio: 'efectivo', monto: 100, fecha: dentro, orden_id: 'c1', registrado_por_nombre: 'Ana' },
      { medio: 'efectivo', monto: 50, fecha: dentro, orden_id: 'c2', registrado_por_nombre: 'Ana' },
      { medio: 'efectivo', monto: 30, fecha: dentro, orden_id: 'c2', registrado_por_nombre: 'Beto' },
      { medio: 'efectivo', monto: 20, fecha: dentro, orden_id: 'c1', registrado_por_nombre: null },
      { medio: 'efectivo', monto: 999, fecha: fuera, orden_id: 'c1', registrado_por_nombre: 'Ana' },
      { medio: 'efectivo', monto: 500, fecha: dentro, orden_id: 'venta', registrado_por_nombre: 'Ana' },
    ];
    const r = cobranzasDeCartera(pagos, ids, desde, hasta);
    expect(r.total).toBe(200);
    expect(r.porEmpleado).toEqual([
      { nombre: 'Ana', monto: 150 },
      { nombre: 'Beto', monto: 30 },
      { nombre: null, monto: 20 },
    ]);
  });
});
