import { describe, expect, it } from 'vitest';
import { propias, textoDeOrdenes, type ReparacionConImei } from './servicioEnStock';

const orden = (extra: Partial<ReparacionConImei>): ReparacionConImei => ({
  id: 'r1',
  numero_orden: 'ST-000031',
  modelo: 'iPhone 13',
  imei: '350000000000001',
  estado: 'en_reparacion',
  cliente_id: null,
  fecha_reparado: null,
  ...extra,
});

describe('equipo cargado al Stock que sigue en Servicio Técnico', () => {
  it('solo las órdenes de equipo propio (sin cliente) se pueden cerrar', () => {
    const propia = orden({ id: 'a' });
    const deCliente = orden({ id: 'b', cliente_id: 'cli-1' });
    expect(propias([propia, deCliente]).map((o) => o.id)).toEqual(['a']);
  });
  it('una orden de cliente nunca queda como cerrable', () => {
    expect(propias([orden({ cliente_id: 'cli-1' })])).toEqual([]);
  });
  it('nombra las órdenes por número, o por modelo si no tienen número', () => {
    expect(textoDeOrdenes([orden({}), orden({ numero_orden: null, modelo: 'iPhone 14' })])).toBe('ST-000031, iPhone 14');
  });
});
