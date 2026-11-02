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

describe('IMEI a medio escribir', () => {
  const c = canje({ imei: '355060123456789' });
  it('mientras lo tipeado sea el comienzo del IMEI del canje, el aviso sigue', () => {
    for (const parcial of ['35', '3550', '35506', '355060123456789']) {
      expect(canjesCoincidentes([c], parcial, '').porImei).toHaveLength(1);
    }
  });
  it('desaparece cuando un dígito deja de coincidir', () => {
    expect(canjesCoincidentes([c], '355960', '').porImei).toHaveLength(0);
    expect(canjesCoincidentes([c], '355960', 'iPhone 13').porModelo).toHaveLength(0); // IMEI distinto: otro equipo
  });
  it('con un solo dígito todavía no avisa (coincidiría con casi todo)', () => {
    expect(canjesCoincidentes([c], '3', '').porImei).toHaveLength(0);
  });
});

describe('IMEI por fracción (no solo el comienzo)', () => {
  const c = canje({ imei: '355060123456789' });
  it('encuentra el equipo por los últimos 4 dígitos', () => {
    expect(canjesCoincidentes([c], '6789', '').porImei).toHaveLength(1);
  });
  it('encuentra el equipo por un tramo del medio', () => {
    expect(canjesCoincidentes([c], '0123', '').porImei).toHaveLength(1);
    expect(canjesCoincidentes([c], '60123456', '').porImei).toHaveLength(1);
  });
  it('con menos de 4 dígitos solo cuenta el comienzo (en el medio coincidiría con casi todo)', () => {
    expect(canjesCoincidentes([c], '678', '').porImei).toHaveLength(0);
    expect(canjesCoincidentes([c], '355', '').porImei).toHaveLength(1);
  });
  it('una fracción que no está en el IMEI no avisa, y con IMEI distinto no cuenta como mismo modelo', () => {
    expect(canjesCoincidentes([c], '9999', '').porImei).toHaveLength(0);
    expect(canjesCoincidentes([c], '9999', 'iPhone 13').porModelo).toHaveLength(0);
  });
  it('ignora espacios al tipear la fracción', () => {
    expect(canjesCoincidentes([c], '67 89', '').porImei).toHaveLength(1);
  });
});
