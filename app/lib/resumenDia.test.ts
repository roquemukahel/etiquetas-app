import { describe, expect, it } from 'vitest';
import { ingresadoACajaDelDia, resumirDia } from './resumenDia';

describe('resumen de un día en Órdenes', () => {
  it('una venta financiada y el cobro de su cuota 1 se muestran por separado, no como dos ventas', () => {
    const r = resumirDia([
      { estado: 'pagado', total: 1200, esCobro: false }, // venta por el precio financiado completo
      { estado: 'pagado', total: 100, esCobro: true }, // cobro de la cuota 1 el mismo día
    ]);
    expect(r.ventas).toEqual({ cantidad: 1, monto: 1200 });
    expect(r.cobros).toEqual({ cantidad: 1, monto: 100 });
  });
  it('los cobros de cuotas de créditos viejos no suman como ventas', () => {
    const r = resumirDia([
      { estado: 'pagado', total: 100, esCobro: true },
      { estado: 'pagado', total: 250, esCobro: true },
      { estado: 'pagado', total: 80, esCobro: false },
    ]);
    expect(r.ventas).toEqual({ cantidad: 1, monto: 80 });
    expect(r.cobros).toEqual({ cantidad: 2, monto: 350 });
  });
  it('una orden cancelada no cuenta en nada', () => {
    const r = resumirDia([
      { estado: 'cancelado', total: 500, esCobro: false },
      { estado: 'cancelado', total: 70, esCobro: true },
    ]);
    expect(r.ventas).toEqual({ cantidad: 0, monto: 0 });
    expect(r.cobros).toEqual({ cantidad: 0, monto: 0 });
  });
  it('un total vacío cuenta como cero', () => {
    expect(resumirDia([{ estado: 'pendiente', total: null, esCobro: false }]).ventas).toEqual({ cantidad: 1, monto: 0 });
  });
});

describe('plata ingresada a caja en un día', () => {
  const dia = new Date(2026, 10, 9, 12, 0, 0).toISOString(); // 9/11/2026 al mediodía, hora local
  const otroDia = new Date(2026, 10, 8, 12, 0, 0).toISOString();
  const pagos = [
    { fecha: dia, monto: 100, medio: 'efectivo', moneda: 'USD', sucursal_id: 's1' },
    { fecha: dia, monto: '50', medio: 'transferencia', moneda: 'USD', sucursal_id: 's2' },
    { fecha: dia, monto: 300, medio: 'canje', moneda: 'USD', sucursal_id: 's1' }, // un equipo no es plata
    { fecha: dia, monto: 999, medio: 'efectivo', moneda: 'ARS', sucursal_id: 's1' }, // otra moneda
    { fecha: otroDia, monto: 70, medio: 'efectivo', moneda: 'USD', sucursal_id: 's1' }, // otro día
  ];
  it('suma los pagos reales de ese día en la moneda principal', () => {
    expect(ingresadoACajaDelDia(pagos, '2026-11-09', { moneda: 'USD' })).toBe(150);
  });
  it('respeta el filtro de sucursal', () => {
    expect(ingresadoACajaDelDia(pagos, '2026-11-09', { moneda: 'USD', sucursalId: 's1' })).toBe(100);
    expect(ingresadoACajaDelDia(pagos, '2026-11-09', { moneda: 'USD', sucursalId: 's2' })).toBe(50);
  });
  it('un día sin pagos da cero', () => {
    expect(ingresadoACajaDelDia(pagos, '2026-11-01', { moneda: 'USD' })).toBe(0);
  });
});
