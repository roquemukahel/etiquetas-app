import { describe, expect, it } from 'vitest';
import { agruparComisiones, aplanarReporte, totalReporte, type MovimientoReporte } from './reporte';

const categorias = [
  { id: 'acc', nombre: 'Accesorios' },
  { id: 'cab', nombre: 'Cables', padre_id: 'acc' },
  { id: 'tem', nombre: 'Templados', padre_id: 'acc' },
  { id: 'ilu', nombre: 'Iluminación' },
];
const mov = (over: Partial<MovimientoReporte>): MovimientoReporte => ({ vendedor_id: 'v1', vendedor: 'Ana', tipo_movimiento: 'comision', categoria_id: null, comision: 0, base: 0, ...over });

describe('reporte de comisiones por categoría y vendedor', () => {
  const movs = [
    mov({ categoria_id: 'cab', comision: 10, base: 1000 }),
    mov({ categoria_id: 'tem', comision: 20, base: 2000 }),
    mov({ categoria_id: 'ilu', comision: 100, base: 1000 }),
    mov({ vendedor_id: 'v2', vendedor: 'Beto', categoria_id: 'ilu', comision: 50, base: 500 }),
    mov({ categoria_id: null, comision: 5, base: 100 }),
    mov({ tipo_movimiento: 'ajuste_positivo', comision: 7 }),
  ];

  it('categoría › vendedor: las subcategorías se suman a su categoría', () => {
    const r = agruparComisiones(movs, categorias, 'categoria');
    const por = Object.fromEntries(r.map((f) => [f.nombre, f.comision]));
    expect(por).toEqual({ Iluminación: 150, Accesorios: 30, 'Sin categoría': 5, 'Ajustes manuales': 7 });
    expect(r[0].nombre).toBe('Iluminación'); // ordenadas por comisión
    expect(r[0].hijos.map((h) => [h.nombre, h.comision])).toEqual([['Ana', 100], ['Beto', 50]]);
  });

  it('separando subcategorías, cada una es su fila con la categoría de arriba', () => {
    const r = agruparComisiones(movs, categorias, 'categoria', true);
    expect(r.map((f) => f.nombre)).toContain('Accesorios › Templados');
    expect(r.map((f) => f.nombre)).toContain('Accesorios › Cables');
    expect(r.find((f) => f.nombre === 'Accesorios › Templados')?.comision).toBe(20);
  });

  it('vendedor › categoría', () => {
    const r = agruparComisiones(movs, categorias, 'vendedor');
    const ana = r.find((f) => f.nombre === 'Ana')!;
    expect(ana.comision).toBe(142);
    expect(ana.hijos.map((h) => h.nombre)).toEqual(['Iluminación', 'Accesorios', 'Ajustes manuales', 'Sin categoría']);
  });

  it('el total del reporte es el mismo en cualquier agrupación', () => {
    expect(totalReporte(agruparComisiones(movs, categorias, 'categoria')).comision).toBe(192);
    expect(totalReporte(agruparComisiones(movs, categorias, 'vendedor')).comision).toBe(192);
  });

  it('una reversión resta comisión y no suma base', () => {
    const r = agruparComisiones([mov({ categoria_id: 'ilu', comision: 100, base: 1000 }), mov({ categoria_id: 'ilu', tipo_movimiento: 'reversion', comision: -40, base: 400 })], categorias, 'categoria');
    expect(r[0]).toMatchObject({ nombre: 'Iluminación', comision: 60, base: 1000 });
  });

  it('una categoría que ya no existe se muestra como eliminada', () => {
    expect(agruparComisiones([mov({ categoria_id: 'borrada', comision: 1 })], categorias, 'categoria')[0].nombre).toBe('Categoría eliminada');
  });

  it('se aplana a filas para el CSV', () => {
    const filas = aplanarReporte(agruparComisiones(movs.slice(2, 4), categorias, 'categoria'));
    expect(filas).toEqual([
      { nivel1: 'Iluminación', nivel2: 'Ana', comision: 100, base: 1000 },
      { nivel1: 'Iluminación', nivel2: 'Beto', comision: 50, base: 500 },
    ]);
  });
});
