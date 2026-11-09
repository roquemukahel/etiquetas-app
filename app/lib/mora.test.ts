import { describe, expect, it } from 'vitest';
import { leerMoraSql } from './mora';

describe('mora que devuelve la base', () => {
  it('lee los números aunque lleguen como texto', () => {
    expect(
      leerMoraSql({ saldo: '610.50', vencido: '0', vencimiento_impago: null, proximo_vencimiento: '2026-12-01', proximo_monto: '10' })
    ).toEqual({ saldo: 610.5, vencido: 0, vencimientoImpago: null, proximoVencimiento: '2026-12-01', proximoMonto: 10 });
  });
  it('una fila con vencido y desde cuándo', () => {
    expect(leerMoraSql({ saldo: 70, vencido: 70, vencimiento_impago: '2026-10-30', proximo_vencimiento: '2026-10-30', proximo_monto: 70 })).toMatchObject({
      vencido: 70,
      vencimientoImpago: '2026-10-30',
    });
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
