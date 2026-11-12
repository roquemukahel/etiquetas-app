import { describe, expect, it } from 'vitest';
import { repartirReversion } from './generar';

const mov = (id: string, comision: number, creado: string, extra: Record<string, unknown> = {}) => ({
  id,
  orden_item_id: 'a',
  comision,
  tipo_movimiento: 'comision',
  estado: 'generada',
  movimiento_original_id: null as string | null,
  created_at: creado,
  ...extra,
});

describe('repartirReversion', () => {
  it('revierte primero la comisión más nueva', () => {
    const r = repartirReversion([mov('viejo', 40, '2026-01-01'), mov('nuevo', 30, '2026-02-01')], 'a', 20);
    expect(r).toEqual([{ originalId: 'nuevo', monto: 20 }]);
  });
  it('si no alcanza con una, sigue con la anterior', () => {
    const r = repartirReversion([mov('viejo', 40, '2026-01-01'), mov('nuevo', 30, '2026-02-01')], 'a', 50);
    expect(r).toEqual([{ originalId: 'nuevo', monto: 30 }, { originalId: 'viejo', monto: 20 }]);
  });
  it('descuenta lo que ya restaron reversiones anteriores', () => {
    const existentes = [
      mov('viejo', 40, '2026-01-01'),
      mov('nuevo', 30, '2026-02-01'),
      mov('rev', -25, '2026-03-01', { tipo_movimiento: 'reversion', movimiento_original_id: 'nuevo' }),
    ];
    expect(repartirReversion(existentes, 'a', 10)).toEqual([{ originalId: 'nuevo', monto: 5 }, { originalId: 'viejo', monto: 5 }]);
  });
  it('ignora las comisiones de otras líneas y las ya revertidas', () => {
    const existentes = [mov('otra', 100, '2026-02-01', { orden_item_id: 'b' }), mov('revertida', 100, '2026-02-02', { estado: 'revertida' }), mov('ok', 10, '2026-01-01')];
    expect(repartirReversion(existentes, 'a', 10)).toEqual([{ originalId: 'ok', monto: 10 }]);
  });
  it('si no queda nada para revertir, el resto va sin vínculo', () => {
    expect(repartirReversion([], 'a', 7)).toEqual([{ originalId: null, monto: 7 }]);
  });
});
