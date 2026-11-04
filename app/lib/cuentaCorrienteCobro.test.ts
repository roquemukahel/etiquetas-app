import { describe, expect, it } from 'vitest';
import { resumenDeCobro, type MovimientoConFecha } from './cuentaCorriente';

const mov = (tipo: 'cargo' | 'abono', monto: number, fecha: string): MovimientoConFecha => ({ tipo, monto, fecha });

describe('comprobante de un cobro de cuenta corriente', () => {
  const movs = [
    mov('cargo', 1000, '2026-10-01T10:00:00Z'),
    mov('abono', 300, '2026-10-10T10:00:00Z'),
    mov('abono', 158.23, '2026-11-02T14:00:00Z'),
  ];

  it('muestra lo que debía, lo que pagó y lo que le queda', () => {
    const r = resumenDeCobro(movs, '2026-11-02T14:00:00Z', 158.23);
    expect(r).toEqual({ deudaAnterior: 700, pagado: 158.23, saldoRestante: 541.77 });
  });

  it('el comprobante de un pago viejo no cambia por lo que pasó después', () => {
    const r = resumenDeCobro(movs, '2026-10-10T10:00:00Z', 300);
    expect(r).toEqual({ deudaAnterior: 1000, pagado: 300, saldoRestante: 700 });
  });

  it('un pago que cancela toda la deuda deja la cuenta en cero', () => {
    const r = resumenDeCobro([mov('cargo', 500, '2026-10-01T10:00:00Z'), mov('abono', 500, '2026-10-05T10:00:00Z')], '2026-10-05T10:00:00Z', 500);
    expect(r).toEqual({ deudaAnterior: 500, pagado: 500, saldoRestante: 0 });
  });

  it('pagar de más deja saldo a favor (negativo)', () => {
    const r = resumenDeCobro([mov('cargo', 100, '2026-10-01T10:00:00Z'), mov('abono', 150, '2026-10-05T10:00:00Z')], '2026-10-05T10:00:00Z', 150);
    expect(r.saldoRestante).toBe(-50);
    expect(r.deudaAnterior).toBe(100);
  });

  it('no arrastra errores de decimales', () => {
    const r = resumenDeCobro([mov('cargo', 0.3, '2026-10-01T10:00:00Z'), mov('abono', 0.1, '2026-10-02T10:00:00Z')], '2026-10-02T10:00:00Z', 0.1);
    expect(r).toEqual({ deudaAnterior: 0.3, pagado: 0.1, saldoRestante: 0.2 });
  });

  it('con una fecha ilegible usa todos los movimientos en vez de inventar un saldo en cero', () => {
    expect(resumenDeCobro(movs, 'no es una fecha', 158.23).saldoRestante).toBe(541.77);
  });
});
