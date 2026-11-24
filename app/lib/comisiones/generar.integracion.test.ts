import { describe, expect, it } from 'vitest';
import { generarComisionesDeOrden, reconciliarComisionesDeCliente } from './generar';

// Base de datos de mentira en memoria: alcanza para las consultas que hace generar.ts (select / eq / in / not / single / maybeSingle /
// insert...select). Sirve para probar el flujo completo (reglas por categoría y comisión sobre lo cobrado) sin una base real.
type Fila = Record<string, any>;

class Consulta {
  private filtros: ((f: Fila) => boolean)[] = [];
  private insertando: Fila[] | null = null;
  constructor(private db: Record<string, Fila[]>, private tabla: string, private falla: (t: string, columnas: string) => boolean) {}
  select(columnas?: string) {
    this.columnas = columnas ?? '';
    return this;
  }
  private columnas = '';
  eq(col: string, valor: unknown) {
    this.filtros.push((f) => f[col] === valor);
    return this;
  }
  in(col: string, lista: unknown[]) {
    this.filtros.push((f) => lista.includes(f[col]));
    return this;
  }
  not(col: string, _op: string, valor: unknown) {
    this.filtros.push((f) => f[col] !== valor && !(valor === null && f[col] == null));
    return this;
  }
  insert(filas: Fila[]) {
    this.insertando = filas;
    return this;
  }
  private resolver(): { data: any; error: { message: string } | null } {
    if (this.falla(this.tabla, this.columnas)) return { data: null, error: { message: 'columna inexistente' } };
    if (this.insertando) {
      const nuevas = this.insertando.map((f, i) => ({ id: `m${(this.db[this.tabla]?.length ?? 0) + i + 1}`, created_at: `2026-11-${String(10 + (this.db[this.tabla]?.length ?? 0)).padStart(2, '0')}`, ...f }));
      (this.db[this.tabla] ??= []).push(...nuevas);
      return { data: nuevas.map((n) => ({ id: n.id })), error: null };
    }
    return { data: (this.db[this.tabla] ?? []).filter((f) => this.filtros.every((fn) => fn(f))), error: null };
  }
  single() {
    const r = this.resolver();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error ?? (r.data?.length ? null : { message: 'no encontrado' }) });
  }
  maybeSingle() {
    const r = this.resolver();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
  }
  then(ok: (v: any) => any, mal?: (e: any) => any) {
    return Promise.resolve(this.resolver()).then(ok, mal);
  }
}
const fakeSupabase = (db: Record<string, Fila[]>, falla: (t: string, c: string) => boolean = () => false) => ({ from: (t: string) => new Consulta(db, t, falla) });

const NEG = 'neg1';
const base = (): Record<string, Fila[]> => ({
  negocios: [{ id: NEG, comisiones_activas: true, comisiones_desde: null, comisiones_generar_en: 'confirmada', comision_plan_default_id: 'plan1', moneda: 'ARS', comisiones_sobre_cobrado: false }],
  comision_planes: [{ id: 'plan1', version: 3, activo: true }],
  comision_plan_vendedores: [],
  comision_reglas: [
    { id: 'rG', plan_id: 'plan1', activo: true, tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'minorista', tipo_item: null, producto_id: null, prioridad: 0, categoria_id: null, marca: null },
    { id: 'rCab', plan_id: 'plan1', activo: true, tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'categoria', tipo_item: null, producto_id: null, prioridad: 0, categoria_id: 'cables', marca: null },
    { id: 'rIlu', plan_id: 'plan1', activo: true, tipo_calculo: 'porcentaje_venta', valor: 10, alcance: 'categoria', tipo_item: null, producto_id: null, prioridad: 0, categoria_id: 'ilu', marca: null },
    { id: 'rAcc', plan_id: 'plan1', activo: true, tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'categoria', tipo_item: null, producto_id: null, prioridad: 0, categoria_id: 'acc', marca: null },
  ],
  stock_categorias: [
    { id: 'acc', padre_id: null },
    { id: 'cables', padre_id: 'acc' },
    { id: 'tem', padre_id: 'acc' },
    { id: 'ilu', padre_id: null },
  ],
  productos: [
    { id: 'pCable', categoria_id: 'cables', marca: 'Baseus' },
    { id: 'pTem', categoria_id: 'tem', marca: null },
    { id: 'pLuz', categoria_id: 'ilu', marca: null },
    { id: 'pSin', categoria_id: null, marca: null },
  ],
  dispositivos: [],
  comision_movimientos: [],
  financiacion_planes: [],
  financiacion_cuotas: [],
});
const orden = (over: Fila = {}): Fila => ({
  id: 'o1',
  negocio_id: NEG,
  vendedor_id: 'v1',
  tipo_venta: 'minorista',
  cuotas: 0,
  estado: 'pagado',
  created_at: '2026-11-10T12:00:00Z',
  moneda: 'ARS',
  total: 0,
  anticipo: 0,
  monto_canje: 0,
  orden_items: [
    { id: 'i1', tipo: 'producto', producto_id: 'pCable', dispositivo_id: null, cantidad: 2, precio_unitario: 1000, costo: 400 },
    { id: 'i2', tipo: 'producto', producto_id: 'pLuz', dispositivo_id: null, cantidad: 1, precio_unitario: 5000, costo: 2000 },
    { id: 'i3', tipo: 'producto', producto_id: 'pTem', dispositivo_id: null, cantidad: 1, precio_unitario: 1000, costo: 300 },
    { id: 'i4', tipo: 'producto', producto_id: 'pSin', dispositivo_id: null, cantidad: 1, precio_unitario: 1000, costo: 300 },
  ],
  ...over,
});

describe('generar comisiones: reglas por categoría', () => {
  it('cada línea toma la regla de su categoría (subcategoría > categoría > general) y guarda su categoría', async () => {
    const db = base();
    db.ordenes = [orden({ total: 9000 })];
    const r = await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    expect(r).toEqual({ generadas: 4, error: null });
    const por = Object.fromEntries(db.comision_movimientos.map((m) => [m.orden_item_id, [m.comision, m.categoria_id, m.regla_id]]));
    expect(por.i1).toEqual([20, 'cables', 'rCab']); // 1% de 2.000: la subcategoría gana sobre "Accesorios"
    expect(por.i2).toEqual([500, 'ilu', 'rIlu']); // 10% de 5.000
    expect(por.i3).toEqual([50, 'tem', 'rAcc']); // "Templados" no tiene regla: toma la de su categoría (5%)
    expect(por.i4).toEqual([20, null, 'rG']); // sin categoría: la regla general (2%)
  });

  it('es idempotente: volver a generar no duplica', async () => {
    const db = base();
    db.ordenes = [orden()];
    await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    const r = await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    expect(r.generadas).toBe(0);
    expect(db.comision_movimientos).toHaveLength(4);
  });

  it('sin las columnas nuevas (SQL sin correr) genera la comisión de siempre', async () => {
    const db = base();
    db.ordenes = [orden()];
    // la base "no tiene" categoria_id/marca en reglas ni en movimientos, ni la opción del negocio
    const falla = (t: string, c: string) =>
      (t === 'comision_reglas' && /categoria_id/.test(c)) || (t === 'negocios' && /sobre_cobrado/.test(c));
    const supabase = fakeSupabase(db, falla);
    // y el insert con categoria_id falla la primera vez
    let intentos = 0;
    const original = supabase.from;
    supabase.from = (t: string) => {
      const q: any = original(t);
      if (t === 'comision_movimientos') {
        const ins = q.insert.bind(q);
        q.insert = (filas: Fila[]) => {
          intentos++;
          if (intentos === 1) {
            q.resolver = () => ({ data: null, error: { message: 'column categoria_id does not exist' } });
            return q;
          }
          return ins(filas);
        };
      }
      return q;
    };
    const r = await generarComisionesDeOrden(supabase, 'o1');
    expect(r.error).toBeNull();
    expect(r.generadas).toBe(4);
    expect(db.comision_movimientos.every((m) => !('categoria_id' in m))).toBe(true);
  });
});

describe('generar comisiones: ventas financiadas sobre lo cobrado', () => {
  const financiada = () => {
    const db = base();
    db.negocios[0].comisiones_sobre_cobrado = true;
    db.ordenes = [
      orden({
        cuotas: 3,
        total: 8000, // lo que quedó a pagar; el valor de la venta es total + anticipo
        anticipo: 2000,
        orden_items: [{ id: 'i1', tipo: 'producto', producto_id: 'pLuz', dispositivo_id: null, cantidad: 2, precio_unitario: 5000, costo: 3000 }],
      }),
    ];
    db.financiacion_planes = [{ id: 'pl1', orden_id: 'o1', cliente_id: 'c1', negocio_id: NEG, importe_financiado: 8000, estado: 'activo' }];
    db.financiacion_cuotas = [1, 2, 3, 4].map((n) => ({ id: `c${n}`, plan_id: 'pl1', importe_original: 2000, importe_pagado: 0, estado: 'pendiente' }));
    return db;
  };

  it('al vender comisiona solo lo cobrado (la entrega)', async () => {
    const db = financiada();
    const r = await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    expect(r.generadas).toBe(1);
    // comisión total: 10% de 10.000 = 1.000; cobrado 2.000/10.000 = 20% → 200
    expect(db.comision_movimientos.map((m) => m.comision)).toEqual([200]);
    expect(db.comision_movimientos[0].regla_snapshot.comision_total).toBe(1000);
  });

  it('cada cuota cobrada suma su parte y al terminar la suma es la comisión entera', async () => {
    const db = financiada();
    const sb = fakeSupabase(db);
    await generarComisionesDeOrden(sb, 'o1');
    for (const n of [1, 2, 3, 4]) {
      db.financiacion_cuotas.find((c) => c.id === `c${n}`)!.importe_pagado = 2000;
      const r = await reconciliarComisionesDeCliente(sb, 'c1');
      expect(r.error).toBeNull();
    }
    expect(db.comision_movimientos.map((m) => m.comision)).toEqual([200, 200, 200, 200, 200]);
    expect(db.comision_movimientos.reduce((a, m) => a + m.comision, 0)).toBe(1000);
    // sin cambios, no genera nada más
    expect((await reconciliarComisionesDeCliente(sb, 'c1')).generadas).toBe(0);
  });

  it('si se anula un pago, se revierte lo que ya no se cobró, ligado a la comisión que lo originó', async () => {
    const db = financiada();
    const sb = fakeSupabase(db);
    await generarComisionesDeOrden(sb, 'o1');
    db.financiacion_cuotas[0].importe_pagado = 2000;
    await reconciliarComisionesDeCliente(sb, 'c1'); // +200
    db.financiacion_cuotas[0].importe_pagado = 0; // se anuló el pago
    const r = await reconciliarComisionesDeCliente(sb, 'c1');
    expect(r.generadas).toBe(1);
    const rev = db.comision_movimientos.find((m) => m.tipo_movimiento === 'reversion')!;
    expect(rev.comision).toBe(-200);
    expect(rev.movimiento_original_id).toBe('m2'); // la comisión más nueva
    expect(db.comision_movimientos.reduce((a, m) => a + m.comision, 0)).toBe(200); // queda solo lo de la entrega
  });

  it('con la opción apagada, una venta financiada comisiona entera al vender', async () => {
    const db = financiada();
    db.negocios[0].comisiones_sobre_cobrado = false;
    const r = await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    expect(r.generadas).toBe(1);
    expect(db.comision_movimientos[0].comision).toBe(1000);
    expect((await reconciliarComisionesDeCliente(fakeSupabase(db), 'c1')).generadas).toBe(0);
  });

  it('una venta sin nada cobrado todavía no genera y avisa por qué', async () => {
    const db = financiada();
    db.ordenes[0].anticipo = 0;
    db.ordenes[0].total = 10000;
    db.financiacion_planes[0].importe_financiado = 10000;
    db.financiacion_cuotas = [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, plan_id: 'pl1', importe_original: 2000, importe_pagado: 0, estado: 'pendiente' }));
    const r = await generarComisionesDeOrden(fakeSupabase(db), 'o1');
    expect(r).toEqual({ generadas: 0, error: null, motivo: 'La comisión se genera a medida que se cobran las cuotas' });
  });

  it('una venta cancelada no genera comisión', async () => {
    const db = financiada();
    db.ordenes[0].estado = 'cancelado';
    expect((await generarComisionesDeOrden(fakeSupabase(db), 'o1')).motivo).toBe('La venta está cancelada');
  });
});
