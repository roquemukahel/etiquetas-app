import { describe, it, expect } from 'vitest';
import {
  calcularComisionVenta,
  reglaParaLinea,
  repartir,
  participacionesValidas,
  reversionProporcional,
  redondear,
  type ContextoCategorias,
  type Regla,
  type Venta,
} from './motor';

const DEC = 0; // pesos argentinos: sin decimales (caso más común del negocio)

function linea(over: Partial<Venta['lineas'][number]> = {}) {
  return { id: 'l1', tipo_item: 'producto', producto_id: null, cantidad: 1, precio_unitario: 0, ...over };
}

describe('motor de comisiones', () => {
  // §24.1 — minorista $100.000 con descuento $10.000, 2% → base 90.000, comisión 1.800
  it('porcentaje sobre venta neta con descuento de línea', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ precio_unitario: 100000, descuento_linea: 10000 })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'minorista' }];
    const res = calcularComisionVenta(venta, reglas, DEC);
    expect(res.base).toBe(90000);
    expect(res.comision).toBe(1800);
  });

  // §24.2 — mayorista $800.000, 0,5% → 4.000
  it('porcentaje mayorista', () => {
    const venta: Venta = { tipo_venta: 'mayorista', lineas: [linea({ precio_unitario: 800000 })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_venta', valor: 0.5, alcance: 'mayorista' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(4000);
  });

  it('regla de "financiado" solo aplica si la venta se financió', () => {
    const contado: Venta = { tipo_venta: 'minorista', es_financiado: false, lineas: [linea({ precio_unitario: 100000 })] };
    const financiado: Venta = { tipo_venta: 'minorista', es_financiado: true, lineas: [linea({ precio_unitario: 100000 })] };
    const reglas: Regla[] = [
      { id: 'c', tipo_calculo: 'porcentaje_venta', valor: 3, alcance: 'contado' },
      { id: 'f', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'financiado' },
    ];
    expect(calcularComisionVenta(contado, reglas, DEC).comision).toBe(3000);
    expect(calcularComisionVenta(financiado, reglas, DEC).comision).toBe(1000);
  });

  it('sin es_financiado (undefined) una venta cuenta como de contado', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ precio_unitario: 100000 })] };
    const reglas: Regla[] = [{ id: 'c', tipo_calculo: 'porcentaje_venta', valor: 3, alcance: 'contado' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(3000);
  });

  // Una venta mayorista Y financiada matchea dos reglas de "dimensiones"
  // distintas (mayorista y financiado) — antes empataban en especificidad y
  // ganaba una u otra según el orden alfabético del id (arbitrario). Ahora
  // financiado/contado están un escalón por encima: gana financiado siempre
  // que la venta lo sea, sin importar el id de ninguna de las dos reglas.
  it('venta mayorista y financiada: gana la regla de financiado, no la de mayorista', () => {
    const venta: Venta = { tipo_venta: 'mayorista', es_financiado: true, lineas: [linea({ precio_unitario: 100000 })] };
    const reglasIdMayoristaMenor: Regla[] = [
      { id: 'a-mayorista', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'mayorista' },
      { id: 'z-financiado', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'financiado' },
    ];
    const reglasIdFinanciadoMenor: Regla[] = [
      { id: 'z-mayorista', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'mayorista' },
      { id: 'a-financiado', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'financiado' },
    ];
    // En los dos casos debe ganar "financiado" (5%), sin importar qué id es
    // menor alfabéticamente — si esto fallara, volvió el desempate arbitrario.
    expect(calcularComisionVenta(venta, reglasIdMayoristaMenor, DEC).comision).toBe(5000);
    expect(calcularComisionVenta(venta, reglasIdFinanciadoMenor, DEC).comision).toBe(5000);
  });

  // §24.3 — venta compartida 70/30 sobre 1.800 → 1.260 / 540
  it('reparte 70/30 sin perder ni sumar centavos', () => {
    const r = repartir(1800, [
      { vendedor_id: 'A', porcentaje: 70 },
      { vendedor_id: 'B', porcentaje: 30 },
    ], DEC);
    expect(r.find((x) => x.vendedor_id === 'A')!.monto).toBe(1260);
    expect(r.find((x) => x.vendedor_id === 'B')!.monto).toBe(540);
    expect(r.reduce((a, x) => a + x.monto, 0)).toBe(1800);
  });

  // §24.4 — ganancia: venta 100.000, costo 80.000, ganancia 20.000, 10% → 2.000
  it('porcentaje sobre ganancia bruta con costo histórico', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ precio_unitario: 100000, costo_unitario: 80000 })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_ganancia', valor: 10, alcance: 'todas' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(2000);
  });

  it('ganancia sin costo histórico no genera comisión (no asume costo 0)', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ precio_unitario: 100000, costo_unitario: null })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_ganancia', valor: 10, alcance: 'todas' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(0);
  });

  it('ganancia <= 0 no genera comisión', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ precio_unitario: 100000, costo_unitario: 120000 })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_ganancia', valor: 10, alcance: 'todas' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(0);
  });

  // §6C — importe fijo por unidad
  it('importe fijo por unidad × cantidad', () => {
    const venta: Venta = { tipo_venta: 'minorista', lineas: [linea({ cantidad: 3, precio_unitario: 50000 })] };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'fijo_por_unidad', valor: 2000, alcance: 'todas' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(6000);
  });

  // §6D — importe fijo por venta (una sola vez, aunque haya varias líneas)
  it('importe fijo por venta se aplica una sola vez', () => {
    const venta: Venta = {
      tipo_venta: 'minorista',
      lineas: [linea({ id: 'a', precio_unitario: 100000 }), linea({ id: 'b', precio_unitario: 200000 })],
    };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'fijo_por_venta', valor: 5000, alcance: 'todas' }];
    expect(calcularComisionVenta(venta, reglas, DEC).comision).toBe(5000);
  });

  // Monto fijo por venta con alcance por TIPO DE ÍTEM: se cobra una sola vez
  // aunque haya varios dispositivos (antes daba $0 = no generaba comisión).
  it('fijo por venta con alcance de dispositivos se cobra una vez', () => {
    const venta: Venta = {
      tipo_venta: 'minorista',
      lineas: [
        linea({ id: 'd1', tipo_item: 'dispositivo', precio_unitario: 500000 }),
        linea({ id: 'd2', tipo_item: 'dispositivo', precio_unitario: 300000 }),
        linea({ id: 'a1', tipo_item: 'producto', precio_unitario: 20000 }),
      ],
    };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'fijo_por_venta', valor: 10, alcance: 'tipo_item', tipo_item: 'dispositivo' }];
    const res = calcularComisionVenta(venta, reglas, DEC);
    expect(res.comision).toBe(10); // una sola vez, no $0
  });

  // §7 — prioridad: la regla de producto específico gana sobre la general
  it('aplica la regla más específica (producto > general), sin sumar', () => {
    const venta: Venta = {
      tipo_venta: 'minorista',
      lineas: [linea({ id: 'esp', producto_id: 'P1', precio_unitario: 100000 }), linea({ id: 'gen', producto_id: 'P2', precio_unitario: 100000 })],
    };
    const reglas: Regla[] = [
      { id: 'g', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'todas' },
      { id: 'p', tipo_calculo: 'porcentaje_venta', valor: 10, alcance: 'producto', producto_id: 'P1' },
    ];
    const res = calcularComisionVenta(venta, reglas, DEC);
    // P1: 10% de 100.000 = 10.000 ; P2: 2% de 100.000 = 2.000 → total 12.000
    expect(res.comision).toBe(12000);
    expect(res.detalle.find((d) => d.linea_id === 'esp')!.comision).toBe(10000);
    expect(res.detalle.find((d) => d.linea_id === 'gen')!.comision).toBe(2000);
  });

  it('resuelve la regla más específica para una línea', () => {
    const reglas: Regla[] = [
      { id: 'g', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'todas' },
      { id: 't', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'tipo_item', tipo_item: 'dispositivo' },
    ];
    const r = reglaParaLinea({ id: 'x', tipo_item: 'dispositivo', producto_id: null, cantidad: 1, precio_unitario: 1 }, { tipo_venta: 'minorista', lineas: [] }, reglas);
    expect(r!.id).toBe('t');
  });

  // §24.9 — descuento general distribuido: la suma de bases coincide con lo elegible
  it('prorratea el descuento general sin descuadrar el total', () => {
    const venta: Venta = {
      tipo_venta: 'minorista',
      descuento_general: 10000,
      lineas: [linea({ id: 'a', precio_unitario: 30000 }), linea({ id: 'b', precio_unitario: 70000 })],
    };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'todas' }];
    const res = calcularComisionVenta(venta, reglas, DEC);
    const sumaBases = res.detalle.reduce((a, d) => a + d.base, 0);
    expect(sumaBases).toBe(90000); // 100.000 − 10.000
    expect(res.base).toBe(90000);
    expect(res.comision).toBe(1800); // 2% de 90.000
  });

  // §24.5 — reversión proporcional del 50%
  it('reversión proporcional del 50%', () => {
    expect(reversionProporcional(1800, 0.5, DEC)).toBe(-900);
  });

  it('reversión total', () => {
    expect(reversionProporcional(1800, 1, DEC)).toBe(-1800);
  });

  // Redondeo determinista con moneda de 2 decimales
  it('redondeo half-up determinista', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(redondear(-1.005, 2)).toBe(-1.01);
    expect(redondear(90000 * 0.02, 0)).toBe(1800);
  });

  it('participaciones deben sumar 100', () => {
    expect(participacionesValidas([{ vendedor_id: 'A', porcentaje: 70 }, { vendedor_id: 'B', porcentaje: 30 }])).toBe(true);
    expect(participacionesValidas([{ vendedor_id: 'A', porcentaje: 70 }, { vendedor_id: 'B', porcentaje: 20 }])).toBe(false);
    expect(participacionesValidas([{ vendedor_id: 'A', porcentaje: 0 }, { vendedor_id: 'B', porcentaje: 100 }])).toBe(false);
  });

  // Comisión total en 2 decimales (USD) coincide con la suma del detalle
  it('el detalle suma exactamente el total (2 decimales)', () => {
    const venta: Venta = {
      tipo_venta: 'minorista',
      lineas: [linea({ id: 'a', precio_unitario: 33.33 }), linea({ id: 'b', precio_unitario: 66.67 })],
    };
    const reglas: Regla[] = [{ id: 'r', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'todas' }];
    const res = calcularComisionVenta(venta, reglas, 2);
    const suma = res.detalle.reduce((a, d) => a + d.comision, 0);
    expect(redondear(suma, 2)).toBe(res.comision);
  });
});

// ---------- Reglas por categoría (pedido de un cliente: menos comisión en templados y cables, más en iluminación) ----------
describe('reglas por categoría', () => {
  // Accesorios > Cables, Accesorios > Templados; Iluminación es de primer nivel.
  const padres: Record<string, string | null> = { acc: null, cables: 'acc', templados: 'acc', ilum: null, elec: null };
  const ctx: ContextoCategorias = { padreDe: (id) => padres[id] ?? null };
  const venta = (lineas: Venta['lineas']): Venta => ({ tipo_venta: 'minorista', lineas });
  const l = (id: string, categoria_id: string | null, precio: number, extra: Partial<Venta['lineas'][number]> = {}) =>
    linea({ id, tipo_item: 'producto', categoria_id, precio_unitario: precio, ...extra });

  it('una regla de categoría aplica a los productos de esa categoría', () => {
    const reglas: Regla[] = [
      { id: 'g', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'minorista' },
      { id: 'i', tipo_calculo: 'porcentaje_venta', valor: 10, alcance: 'categoria', categoria_id: 'ilum' },
    ];
    const res = calcularComisionVenta(venta([l('a', 'ilum', 1000), l('b', 'elec', 1000)]), reglas, DEC, ctx);
    expect(res.detalle.map((d) => d.comision)).toEqual([100, 20]); // iluminación 10%, el resto la regla general 2%
  });

  it('una regla de la categoría de arriba alcanza a sus subcategorías', () => {
    const reglas: Regla[] = [{ id: 'acc', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'categoria', categoria_id: 'acc' }];
    const res = calcularComisionVenta(venta([l('a', 'cables', 1000), l('b', 'acc', 1000), l('c', 'ilum', 1000)]), reglas, DEC, ctx);
    expect(res.detalle.map((d) => d.comision)).toEqual([50, 50, 0]);
  });

  it('la subcategoría gana sobre su categoría', () => {
    const reglas: Regla[] = [
      { id: 'acc', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'categoria', categoria_id: 'acc' },
      { id: 'cab', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'categoria', categoria_id: 'cables' },
    ];
    const res = calcularComisionVenta(venta([l('a', 'cables', 1000), l('b', 'templados', 1000)]), reglas, DEC, ctx);
    expect(res.detalle.map((d) => [d.regla_id, d.comision])).toEqual([['cab', 10], ['acc', 50]]);
  });

  it('una regla con marca gana sobre la misma categoría sin marca, y solo aplica a esa marca', () => {
    const reglas: Regla[] = [
      { id: 'cab', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'categoria', categoria_id: 'cables' },
      { id: 'cabx', tipo_calculo: 'porcentaje_venta', valor: 4, alcance: 'categoria', categoria_id: 'cables', marca: 'Baseus' },
    ];
    const res = calcularComisionVenta(venta([l('a', 'cables', 1000, { marca: ' baseus ' }), l('b', 'cables', 1000, { marca: 'Otra' }), l('c', 'cables', 1000)]), reglas, DEC, ctx);
    expect(res.detalle.map((d) => d.regla_id)).toEqual(['cabx', 'cab', 'cab']);
  });

  it('prioridad: producto puntual > categoría > tipo de ítem > regla general', () => {
    const reglas: Regla[] = [
      { id: 'todas', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'todas' },
      { id: 'min', tipo_calculo: 'porcentaje_venta', valor: 2, alcance: 'minorista' },
      { id: 'tipo', tipo_calculo: 'porcentaje_venta', valor: 3, alcance: 'tipo_item', tipo_item: 'producto' },
      { id: 'cat', tipo_calculo: 'porcentaje_venta', valor: 4, alcance: 'categoria', categoria_id: 'ilum' },
      { id: 'prod', tipo_calculo: 'porcentaje_venta', valor: 5, alcance: 'producto', producto_id: 'P1' },
    ];
    const v = venta([l('a', 'ilum', 100, { producto_id: 'P1' }), l('b', 'ilum', 100), l('c', 'elec', 100), l('d', null, 100)]);
    const res = calcularComisionVenta(v, reglas, DEC, ctx);
    expect(res.detalle.map((d) => d.regla_id)).toEqual(['prod', 'cat', 'tipo', 'tipo']);
  });

  it('una categoría gana sobre "financiado" y sobre minorista/mayorista', () => {
    const v: Venta = { tipo_venta: 'mayorista', es_financiado: true, lineas: [l('a', 'ilum', 100)] };
    const reglas: Regla[] = [
      { id: 'fin', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'financiado' },
      { id: 'may', tipo_calculo: 'porcentaje_venta', valor: 1, alcance: 'mayorista' },
      { id: 'cat', tipo_calculo: 'porcentaje_venta', valor: 9, alcance: 'categoria', categoria_id: 'ilum' },
    ];
    expect(calcularComisionVenta(v, reglas, DEC, ctx).detalle[0].regla_id).toBe('cat');
  });

  it('una línea sin categoría no cae en reglas de categoría', () => {
    const reglas: Regla[] = [{ id: 'cat', tipo_calculo: 'porcentaje_venta', valor: 9, alcance: 'categoria', categoria_id: 'ilum' }];
    expect(calcularComisionVenta(venta([l('a', null, 1000)]), reglas, DEC, ctx).comision).toBe(0);
  });

  it('una regla de categoría sin categoría elegida (se borró) no aplica a nada', () => {
    const reglas: Regla[] = [{ id: 'cat', tipo_calculo: 'porcentaje_venta', valor: 9, alcance: 'categoria', categoria_id: null }];
    expect(calcularComisionVenta(venta([l('a', 'ilum', 1000)]), reglas, DEC, ctx).comision).toBe(0);
  });

  it('con "% sobre la ganancia" y fijo por unidad en una categoría', () => {
    const reglas: Regla[] = [
      { id: 'g', tipo_calculo: 'porcentaje_ganancia', valor: 50, alcance: 'categoria', categoria_id: 'ilum' },
      { id: 'u', tipo_calculo: 'fijo_por_unidad', valor: 30, alcance: 'categoria', categoria_id: 'elec' },
    ];
    const res = calcularComisionVenta(venta([l('a', 'ilum', 1000, { costo_unitario: 600 }), l('b', 'elec', 1000, { cantidad: 3 })]), reglas, DEC, ctx);
    expect(res.detalle.map((d) => d.comision)).toEqual([200, 90]);
  });
});
