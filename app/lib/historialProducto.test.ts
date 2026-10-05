import { describe, expect, it } from 'vitest';
import { cambiosDeAuditoria, procesarMovimientos, type MovimientoCrudo } from './historialProducto';

let n = 0;
const mov = (extra: Partial<MovimientoCrudo> & Pick<MovimientoCrudo, 'tipo' | 'cantidad' | 'cantidad_resultante'>): MovimientoCrudo => {
  n++;
  return {
    id: `m${String(n).padStart(3, '0')}`,
    producto_id: 'p1',
    motivo: null,
    usuario: 'Ana',
    orden_id: null,
    created_at: `2026-10-0${Math.min(n, 9)}T10:00:00Z`,
    ...extra,
  };
};

describe('procesarMovimientos', () => {
  it('ventas y entradas llevan su signo y el stock de antes', () => {
    n = 0;
    const r = procesarMovimientos([
      mov({ tipo: 'entrada', cantidad: 30, cantidad_resultante: 30 }),
      mov({ tipo: 'venta', cantidad: 2, cantidad_resultante: 28 }),
    ]);
    // el más nuevo primero
    expect(r[0]).toMatchObject({ tipo: 'venta', cambio: -2, stockAntes: 30, sinRegistro: 0 });
    expect(r[1]).toMatchObject({ tipo: 'entrada', cambio: 30, stockAntes: 0 });
  });

  it('detecta unidades que cambiaron sin registro entre dos movimientos', () => {
    n = 0;
    const r = procesarMovimientos([
      mov({ tipo: 'entrada', cantidad: 30, cantidad_resultante: 30 }),
      // alguien dejó el stock en 27 sin pasar por el registro; la venta siguiente parte de 27
      mov({ tipo: 'venta', cantidad: 1, cantidad_resultante: 26 }),
    ]);
    expect(r[0]).toMatchObject({ tipo: 'venta', stockAntes: 27, sinRegistro: -3 });
  });

  it('un ajuste deduce si sumó o restó mirando el movimiento anterior', () => {
    n = 0;
    const r = procesarMovimientos([
      mov({ tipo: 'entrada', cantidad: 10, cantidad_resultante: 10 }),
      mov({ tipo: 'ajuste', cantidad: 3, cantidad_resultante: 7 }),
      mov({ tipo: 'ajuste', cantidad: 5, cantidad_resultante: 12 }),
    ]);
    expect(r[1]).toMatchObject({ cambio: -3, stockAntes: 10, sinRegistro: 0 });
    expect(r[0]).toMatchObject({ cambio: 5, stockAntes: 7, sinRegistro: 0 });
  });

  it('un ajuste sin movimiento anterior no adivina el sentido', () => {
    n = 0;
    const r = procesarMovimientos([mov({ tipo: 'ajuste', cantidad: 3, cantidad_resultante: 7 })]);
    expect(r[0]).toMatchObject({ cambio: null, stockAntes: null, sinRegistro: null });
  });

  it('no mezcla los movimientos de productos distintos (sucursales)', () => {
    n = 0;
    const r = procesarMovimientos([
      mov({ producto_id: 'a', tipo: 'entrada', cantidad: 10, cantidad_resultante: 10 }),
      mov({ producto_id: 'b', tipo: 'entrada', cantidad: 4, cantidad_resultante: 4 }),
      mov({ producto_id: 'a', tipo: 'venta', cantidad: 1, cantidad_resultante: 9 }),
      mov({ producto_id: 'b', tipo: 'venta', cantidad: 1, cantidad_resultante: 3 }),
    ]);
    expect(r.every((m) => m.sinRegistro === 0 || m.sinRegistro === null)).toBe(true);
  });

  it('el primer movimiento de la lista no tiene con qué compararse', () => {
    n = 0;
    const r = procesarMovimientos([mov({ tipo: 'venta', cantidad: 1, cantidad_resultante: 25 })]);
    expect(r[0]).toMatchObject({ cambio: -1, stockAntes: 26, sinRegistro: null });
  });
});

describe('cambiosDeAuditoria', () => {
  it('lista solo lo que cambió', () => {
    expect(cambiosDeAuditoria({ cantidad: 26, precio: 1500, costo: 900 }, { cantidad: 25, precio: 1500, costo: 900 })).toEqual([
      { campo: 'Cantidad', antes: '26', despues: '25' },
    ]);
  });

  it('muestra un guion para lo vacío', () => {
    expect(cambiosDeAuditoria({ sku: null }, { sku: 'ABC' })).toEqual([{ campo: 'SKU', antes: '—', despues: 'ABC' }]);
  });

  it('sin detalle guardado (auditoría vieja) no devuelve nada', () => {
    expect(cambiosDeAuditoria(null, null)).toEqual([]);
    expect(cambiosDeAuditoria({ a: 1 }, null)).toEqual([]);
  });
});
