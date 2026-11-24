import { describe, expect, it } from 'vitest';
import { saldosPorCategoria, type MovimientoFondo } from './fondos';

type Mov = Pick<MovimientoFondo, 'categoria' | 'tipo' | 'importe' | 'anulado'>;

describe('saldo de fondos disponibles por categoría', () => {
  it('suma ingresos y resta egresos, cada categoría por separado', () => {
    const movs: Mov[] = [
      { categoria: 'efectivo_ars', tipo: 'ingreso', importe: 10000, anulado: false },
      { categoria: 'efectivo_ars', tipo: 'egreso', importe: 3000, anulado: false },
      { categoria: 'transferencia_ars', tipo: 'ingreso', importe: 50000, anulado: false },
      { categoria: 'efectivo_usd', tipo: 'ingreso', importe: 200, anulado: false },
      { categoria: 'efectivo_usd', tipo: 'egreso', importe: 50, anulado: false },
    ];
    expect(saldosPorCategoria(movs)).toEqual({
      efectivo_ars: 7000,
      transferencia_ars: 50000,
      efectivo_usd: 150,
    });
  });

  it('un movimiento anulado no cuenta para el saldo', () => {
    const movs: Mov[] = [
      { categoria: 'efectivo_ars', tipo: 'ingreso', importe: 10000, anulado: false },
      { categoria: 'efectivo_ars', tipo: 'ingreso', importe: 5000, anulado: true },
    ];
    expect(saldosPorCategoria(movs).efectivo_ars).toBe(10000);
  });

  it('sin movimientos, las 3 categorías arrancan en 0', () => {
    expect(saldosPorCategoria([])).toEqual({ efectivo_ars: 0, transferencia_ars: 0, efectivo_usd: 0 });
  });
});
