import { describe, expect, it } from 'vitest';
import { leerMoraSql } from './mora';

describe('mora que devuelve la base', () => {
  it('lee los números aunque lleguen como texto', () => {
    expect(
      leerMoraSql({ saldo: '610.50', vencido: '0', vencimiento_impago: null, proximo_vencimiento: '2026-12-01', proximo_monto: '10' })
    ).toEqual({ saldo: 610.5, vencido: 0, vencimientoImpago: null, proximoVencimiento: '2026-12-01', proximoMonto: 10, vencidoCuotas: 0, vencidoFiado: 0 });
  });
  it('una fila con vencido y desde cuándo', () => {
    expect(leerMoraSql({ saldo: 70, vencido: 70, vencimiento_impago: '2026-10-30', proximo_vencimiento: '2026-10-30', proximo_monto: 70 })).toMatchObject({
      vencido: 70,
      vencimientoImpago: '2026-10-30',
    });
  });
  it('separa el vencido de cuotas del de cuenta corriente / fiado', () => {
    expect(
      leerMoraSql({ saldo: 300, vencido: 150, vencimiento_impago: '2026-10-10', proximo_vencimiento: '2026-10-10', proximo_monto: 50, vencido_cuotas: '100', vencido_fiado: 50 })
    ).toMatchObject({ vencido: 150, vencidoCuotas: 100, vencidoFiado: 50 });
  });
  it('sin deuda pendiente no hay próximo vencimiento', () => {
    expect(leerMoraSql({ saldo: -50, vencido: 0, vencimiento_impago: null, proximo_vencimiento: null, proximo_monto: null })).toMatchObject({
      proximoVencimiento: null,
      proximoMonto: null,
    });
  });
  it('si la base todavía tiene la versión vieja (sin esas columnas) devuelve null para usar el cálculo de siempre', () => {
    expect(leerMoraSql({ saldo: 100, vencido: 100 })).toBeNull();
    expect(leerMoraSql(null)).toBeNull();
    expect(leerMoraSql(undefined)).toBeNull();
  });
});
