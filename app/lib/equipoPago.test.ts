import { describe, expect, it } from 'vitest';
import { EQUIPO_PAGO_VACIO, descripcionDelEquipo, problemaDelEquipo } from './equipoPago';

describe('equipo recibido como parte de pago', () => {
  it('sin modelo no se puede registrar', () => {
    expect(problemaDelEquipo(EQUIPO_PAGO_VACIO)).not.toBeNull();
    expect(problemaDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: '   ' })).not.toBeNull();
  });
  it('con modelo alcanza; la batería es opcional pero tiene que ser 0-100', () => {
    expect(problemaDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 13' })).toBeNull();
    expect(problemaDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 13', bateria: '87' })).toBeNull();
    expect(problemaDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 13', bateria: '150' })).not.toBeNull();
    expect(problemaDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 13', bateria: '8a' })).not.toBeNull();
  });
  it('arma la descripción con GB/TB y color', () => {
    expect(descripcionDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 15 Pro', capacidad_gb: 1024, color: 'Titanio natural' })).toBe('iPhone 15 Pro 1TB Titanio natural');
    expect(descripcionDelEquipo({ ...EQUIPO_PAGO_VACIO, modelo: 'iPhone 13' })).toBe('iPhone 13');
  });
});
