import { describe, expect, it } from 'vitest';
import type { ItemProductoR } from './datos';
import {
  armarCSVRanking,
  categoriaTieneSubcategorias,
  filtrarItemsRanking,
  ordenarRanking,
  rankingCategoriasCompleto,
  rankingProductosCompleto,
  rankingSubcategoriasCompleto,
  totalDeFilas,
} from './rankingCompleto';

const items: ItemProductoR[] = [
  { clave: 'cab1', nombre: 'Cable USB-C', categoriaNombre: 'ACC', subcategoriaNombre: 'Cables', cantidad: 10, precio_unitario: 100, costo: 40 },
  { clave: 'cab1', nombre: 'Cable USB-C', categoriaNombre: 'ACC', subcategoriaNombre: 'Cables', cantidad: 5, precio_unitario: 120, costo: 40 },
  { clave: 'cab2', nombre: 'Cable Lightning', categoriaNombre: 'ACC', subcategoriaNombre: 'Cables', cantidad: 2, precio_unitario: 200, costo: null },
  { clave: 'car1', nombre: 'Cargador 20W', categoriaNombre: 'ACC', subcategoriaNombre: 'Cargadores', cantidad: 3, precio_unitario: 500, costo: 300 },
  { clave: 'suelto', nombre: 'Pin', categoriaNombre: 'ACC', cantidad: 4, precio_unitario: 10, costo: 5 },
  { clave: 'iph', nombre: 'iPhone 15', categoriaNombre: 'Celulares', cantidad: 1, precio_unitario: 1000, costo: 800 },
];

describe('ranking completo de productos', () => {
  it('suma unidades, facturación, costo y ganancia por producto (todas las filas, no un top 10)', () => {
    const r = rankingProductosCompleto(items);
    expect(r).toHaveLength(5);
    const cable = r.find((f) => f.clave === 'cab1')!;
    expect(cable.unidades).toBe(15);
    expect(cable.facturacion).toBe(1600); // 10×100 + 5×120
    expect(cable.costo).toBe(600);
    expect(cable.ganancia).toBe(1000);
    expect(cable.margen).toBeCloseTo(62.5, 5);
  });

  it('sin costo cargado: costo, ganancia y margen quedan vacíos (no cero)', () => {
    const f = rankingProductosCompleto(items).find((x) => x.clave === 'cab2')!;
    expect(f.facturacion).toBe(400);
    expect(f.costo).toBeNull();
    expect(f.ganancia).toBeNull();
    expect(f.margen).toBeNull();
  });

  it('categorías y subcategorías: lo que está directo en la categoría va como "Sin subcategoría"', () => {
    expect(rankingCategoriasCompleto(items).map((f) => f.nombre).sort()).toEqual(['ACC', 'Celulares']);
    const subs = rankingSubcategoriasCompleto(items, 'ACC');
    expect(subs.map((f) => f.nombre).sort()).toEqual(['Cables', 'Cargadores', 'Sin subcategoría']);
    expect(subs.find((f) => f.nombre === 'Cables')!.unidades).toBe(17);
    expect(categoriaTieneSubcategorias(items, 'ACC')).toBe(true);
    expect(categoriaTieneSubcategorias(items, 'Celulares')).toBe(false);
  });

  it('filtra por categoría y por subcategoría', () => {
    expect(filtrarItemsRanking(items, { categoria: 'Celulares' })).toHaveLength(1);
    expect(filtrarItemsRanking(items, { categoria: 'ACC', subcategoria: 'Cargadores' })).toHaveLength(1);
    expect(filtrarItemsRanking(items, { categoria: 'ACC', subcategoria: 'Sin subcategoría' }).map((i) => i.clave)).toEqual(['suelto']);
    expect(filtrarItemsRanking(items, {})).toHaveLength(6);
  });

  it('ordena por cualquier columna y deja siempre al final los que no tienen costo', () => {
    const r = rankingProductosCompleto(items);
    expect(ordenarRanking(r, 'unidades', true)[0].clave).toBe('cab1');
    expect(ordenarRanking(r, 'unidades', false)[0].clave).toBe('iph');
    const porGanancia = ordenarRanking(r, 'ganancia', true);
    expect(porGanancia[0].clave).toBe('cab1');
    expect(porGanancia[porGanancia.length - 1].clave).toBe('cab2');
    const porGananciaAsc = ordenarRanking(r, 'ganancia', false);
    expect(porGananciaAsc[porGananciaAsc.length - 1].clave).toBe('cab2');
    expect(ordenarRanking(r, 'nombre', false).map((f) => f.nombre)).toEqual(['Cable Lightning', 'Cable USB-C', 'Cargador 20W', 'iPhone 15', 'Pin']);
  });

  it('el total suma todas las filas', () => {
    const t = totalDeFilas(rankingProductosCompleto(items));
    expect(t.unidades).toBe(25);
    expect(t.facturacion).toBe(1600 + 400 + 1500 + 40 + 1000);
    expect(t.costo).toBe(600 + 900 + 20 + 800);
    expect(totalDeFilas([]).costo).toBeNull();
  });

  it('el CSV sale sin costos si no hay permiso y protege las fórmulas', () => {
    const filas = rankingProductosCompleto([{ clave: 'x', nombre: '=SUMA(1)', categoriaNombre: 'A', cantidad: 2, precio_unitario: 10, costo: 4 }]);
    const sin = armarCSVRanking(filas, false, 'Producto').split('\n');
    expect(sin[0]).toBe('"Producto","Unidades","Facturación"');
    expect(sin[1]).toBe('"\'=SUMA(1)","2","20"');
    const con = armarCSVRanking(filas, true, 'Producto').split('\n');
    expect(con[0]).toBe('"Producto","Unidades","Facturación","Costo","Ganancia","Margen %"');
    expect(con[1]).toBe('"\'=SUMA(1)","2","20","8","12","60.0"');
  });
});
