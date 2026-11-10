import { describe, expect, it } from 'vitest';
import { armarCronograma, coincideDatosCobro, coincideSucursal, diaDeCobro, SIN_SUCURSAL, terminacionDni, yaCobroNoPago } from './clienteCobro';

describe('día de cobro del cliente', () => {
  const cron = armarCronograma([
    { fuente: 'jubilacion_pension', terminacion: 3, dia: 12 },
    { fuente: 'auh_asignacion', terminacion: 3, dia: 20 },
  ]);
  it('la terminación sale del último dígito del DNI, con o sin puntos', () => {
    expect(terminacionDni('30.123.453')).toBe(3);
    expect(terminacionDni(' 27123450 ')).toBe(0);
    expect(terminacionDni('')).toBeNull();
    expect(terminacionDni(null)).toBeNull();
  });
  it('el día cargado a mano gana', () => {
    expect(diaDeCobro({ dia_cobro: 5, fuente_ingreso: 'jubilacion_pension', dni: '30123453' }, cron)).toEqual({ dia: 5, origen: 'manual' });
  });
  it('jubilados y AUH toman el día del cronograma según la terminación del DNI', () => {
    expect(diaDeCobro({ fuente_ingreso: 'jubilacion_pension', dni: '30123453' }, cron)).toEqual({ dia: 12, origen: 'cronograma' });
    expect(diaDeCobro({ fuente_ingreso: 'auh_asignacion', dni: '30123453' }, cron)).toEqual({ dia: 20, origen: 'cronograma' });
  });
  it('sin cronograma, sin DNI o de otra fuente no hay día', () => {
    expect(diaDeCobro({ fuente_ingreso: 'jubilacion_pension', dni: '30123453' }, null)).toBeNull();
    expect(diaDeCobro({ fuente_ingreso: 'jubilacion_pension', dni: '' }, cron)).toBeNull();
    expect(diaDeCobro({ fuente_ingreso: 'empleado_estatal', dni: '30123453' }, cron)).toBeNull();
    expect(diaDeCobro({ fuente_ingreso: 'jubilacion_pension', dni: '30123459' }, cron)).toBeNull();
  });
});

describe('"Ya cobró – no pagó"', () => {
  const base = { diaCobro: 5, hoy: new Date(2026, 10, 10), saldo: 1000, vencido: 0, proximoVencimiento: null as string | null, pagoEsteMes: false };
  it('cobra el 5, hoy es 10, tiene algo vencido y no pagó → se marca', () => {
    expect(yaCobroNoPago({ ...base, vencido: 300 })).toBe(true);
  });
  it('también si la cuota del mes vence este mes y todavía no la pagó', () => {
    expect(yaCobroNoPago({ ...base, proximoVencimiento: '2026-11-20' })).toBe(true);
  });
  it('no se marca antes del día de cobro, ni el mismo día', () => {
    expect(yaCobroNoPago({ ...base, vencido: 300, hoy: new Date(2026, 10, 3) })).toBe(false);
    expect(yaCobroNoPago({ ...base, vencido: 300, hoy: new Date(2026, 10, 5) })).toBe(false);
  });
  it('no se marca si ya pagó algo este mes, si no debe o si no tiene día de cobro', () => {
    expect(yaCobroNoPago({ ...base, vencido: 300, pagoEsteMes: true })).toBe(false);
    expect(yaCobroNoPago({ ...base, vencido: 300, saldo: 0 })).toBe(false);
    expect(yaCobroNoPago({ ...base, vencido: 300, diaCobro: null })).toBe(false);
  });
  it('si lo que debe vence recién el mes que viene, todavía no corresponde', () => {
    expect(yaCobroNoPago({ ...base, proximoVencimiento: '2026-12-05' })).toBe(false);
  });
  it('día 31 en un mes de 30 días cuenta como el último día', () => {
    expect(yaCobroNoPago({ ...base, diaCobro: 31, vencido: 10, hoy: new Date(2026, 10, 30) })).toBe(false);
    expect(yaCobroNoPago({ ...base, diaCobro: 31, vencido: 10, hoy: new Date(2026, 11, 1) })).toBe(false); // otro mes: 1 <= 31
  });
});

describe('filtros por sucursal y datos de cobro', () => {
  it('sucursal: todas, sin asignar o una puntual', () => {
    expect(coincideSucursal('a', '')).toBe(true);
    expect(coincideSucursal(null, SIN_SUCURSAL)).toBe(true);
    expect(coincideSucursal('a', SIN_SUCURSAL)).toBe(false);
    expect(coincideSucursal('a', 'a')).toBe(true);
    expect(coincideSucursal(null, 'a')).toBe(false);
  });
  it('combina sucursal, fuente, rango y calificación', () => {
    const c = { sucursal_origen_id: 'a', fuente_ingreso: 'empleado_estatal', rango_pago: '5-10', calificacion: 'bueno' };
    expect(coincideDatosCobro(c, { sucursal: 'a', fuente: 'empleado_estatal', rango: '5-10', calificacion: 'bueno' })).toBe(true);
    expect(coincideDatosCobro(c, { sucursal: 'b', fuente: '', rango: '', calificacion: '' })).toBe(false);
    expect(coincideDatosCobro(c, { sucursal: '', fuente: 'otro', rango: '', calificacion: '' })).toBe(false);
    expect(coincideDatosCobro({}, { sucursal: '', fuente: '', rango: '', calificacion: '' })).toBe(true);
  });
});
