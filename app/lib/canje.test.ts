import { describe, expect, it } from 'vitest';
import { canjesCoincidentes, type CanjeParaStock } from './canje';

const canje = (extra: Partial<CanjeParaStock>): CanjeParaStock => ({
  id: 'c1',
  modelo: 'iPhone 13',
  capacidad_gb: 128,
  color: 'Azul',
  imei: '356938035643809',
  salud_bateria: 88,
  detalles: null,
  condicion: 'usado',
  ...extra,
});

describe('canjes que pueden ser el equipo que se carga a mano', () => {
  it('mismo IMEI = el equipo ya está en Plan Canje (ignora espacios)', () => {
    const r = canjesCoincidentes([canje({})], '3569 3803 5643 809', 'iPhone 13');
    expect(r.porImei).toHaveLength(1);
    expect(r.porModelo).toHaveLength(0);
  });

  it('IMEI distinto en el mismo modelo = otro equipo, no avisa', () => {
    const r = canjesCoincidentes([canje({})], '111111111111111', 'iPhone 13');
    expect(r.porImei).toHaveLength(0);
    expect(r.porModelo).toHaveLength(0);
  });

  it('sin IMEI tipeado avisa por modelo (sin distinguir mayúsculas)', () => {
    const r = canjesCoincidentes([canje({}), canje({ id: 'c2', modelo: 'iPhone 12' })], '', 'iphone 13');
    expect(r.porImei).toHaveLength(0);
    expect(r.porModelo.map((c) => c.id)).toEqual(['c1']);
  });

  it('un canje sin IMEI cargado no se puede descartar por IMEI: avisa por modelo', () => {
    const r = canjesCoincidentes([canje({ imei: null })], '356938035643809', 'iPhone 13');
    expect(r.porModelo).toHaveLength(1);
  });

  it('sin modelo ni IMEI no avisa nada', () => {
    const r = canjesCoincidentes([canje({})], '', '');
    expect(r).toEqual({ porImei: [], porModelo: [] });
  });
});

describe('modelos escritos a mano', () => {
  it('"iPhone 6 s Plus" y "iphone 6s plus" son el mismo modelo', () => {
    const r = canjesCoincidentes([canje({ modelo: 'iPhone 6 s Plus', imei: null })], '', 'iphone 6s plus');
    expect(r.porModelo).toHaveLength(1);
  });
});
