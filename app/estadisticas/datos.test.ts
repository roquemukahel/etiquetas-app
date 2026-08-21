import { describe, it, expect } from 'vitest';
import { rangoDe, resumenFinanciacionDe, resumenComisionesDe } from './datos';

// "Ahora" fijo para que los tests sean deterministas: miércoles 19 de
// agosto de 2026, 15:00.
const AHORA = new Date(2026, 7, 19, 15, 0, 0, 0);

describe('rangoDe — período actual (sin fechaReferencia, igual que antes)', () => {
  it('hoy: arranca a medianoche y termina en "ahora" (parcial)', () => {
    const r = rangoDe('hoy', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 7, 19, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('semana: arranca el lunes de esta semana y termina en "ahora"', () => {
    const r = rangoDe('semana', AHORA);
    // 19/8/2026 es miércoles → el lunes es 17/8/2026.
    expect(r.inicio).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('mes: arranca el 1° del mes y termina en "ahora"', () => {
    const r = rangoDe('mes', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('año: arranca el 1° de enero y termina en "ahora"', () => {
    const r = rangoDe('anio', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });
});

describe('rangoDe — período pasado cerrado (fechaReferencia distinta de ahora)', () => {
  it('hoy de ayer: día completo (00:00 a 23:59:59.999), no cortado', () => {
    const ayer = new Date(2026, 7, 18, 10, 0, 0, 0);
    const r = rangoDe('hoy', AHORA, ayer);
    expect(r.inicio).toEqual(new Date(2026, 7, 18, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2026, 7, 18, 23, 59, 59, 999));
    // La comparación también es día completo contra día completo.
    expect(r.inicioPrev).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 7, 17, 23, 59, 59, 999));
  });

  it('semana pasada: lunes a domingo completo, no hasta "ahora"', () => {
    // Cualquier día de la semana pasada debería dar el mismo resultado.
    const miercolesPasado = new Date(2026, 7, 12, 9, 0, 0, 0);
    const r = rangoDe('semana', AHORA, miercolesPasado);
    expect(r.inicio).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0)); // lunes 10/8
    expect(r.fin).toEqual(new Date(2026, 7, 16, 23, 59, 59, 999)); // domingo 16/8
    expect(r.inicioPrev).toEqual(new Date(2026, 7, 3, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('mes pasado: 1° al último día del mes completo', () => {
    const julio = new Date(2026, 6, 15, 9, 0, 0, 0);
    const r = rangoDe('mes', AHORA, julio);
    expect(r.inicio).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(r.inicioPrev).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });

  it('año pasado: 1° de enero a 31 de diciembre completo', () => {
    const añoPasado = new Date(2025, 5, 1, 9, 0, 0, 0);
    const r = rangoDe('anio', AHORA, añoPasado);
    expect(r.inicio).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    expect(r.inicioPrev).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2024, 11, 31, 23, 59, 59, 999));
  });

  it('semana que resulta ser la actual usa el comportamiento parcial, no el cerrado', () => {
    // fechaReferencia cae en la MISMA semana que "ahora" → debe comportarse
    // como el período actual (fin = ahora), no como semana cerrada.
    const lunesDeEstaSemana = new Date(2026, 7, 17, 8, 0, 0, 0);
    const r = rangoDe('semana', AHORA, lunesDeEstaSemana);
    expect(r.fin).toEqual(AHORA);
  });
});

describe('resumenFinanciacionDe', () => {
  const HOY = new Date(2026, 7, 19, 12, 0, 0, 0); // miércoles 19/8/2026
  const INICIO_MES = new Date(2026, 7, 1, 0, 0, 0, 0);
  const FIN_MES = HOY;

  it('sin planes ni cuotas: hayDatos en false y todo en 0', () => {
    const r = resumenFinanciacionDe([], [], [], INICIO_MES, FIN_MES, HOY);
    expect(r.hayDatos).toBe(false);
    expect(r.totalFinanciadoActivo).toBe(0);
    expect(r.saldoPendiente).toBe(0);
    expect(r.pctMorosidad).toBe(0);
  });

  it('totalFinanciadoActivo suma planes activos y completados, no anulados ni reprogramados', () => {
    const planes = [
      { importe_financiado: 100000, estado: 'activo', created_at: '2026-07-01T00:00:00Z' },
      { importe_financiado: 50000, estado: 'completado', created_at: '2026-07-01T00:00:00Z' },
      { importe_financiado: 30000, estado: 'anulado', created_at: '2026-07-01T00:00:00Z' },
      { importe_financiado: 20000, estado: 'reprogramado', created_at: '2026-07-01T00:00:00Z' },
    ];
    const r = resumenFinanciacionDe(planes, [], [], INICIO_MES, FIN_MES, HOY);
    expect(r.totalFinanciadoActivo).toBe(150000);
  });

  it('nuevosCreditosPeriodo solo cuenta planes creados dentro del rango', () => {
    const planes = [
      { importe_financiado: 100000, estado: 'activo', created_at: '2026-08-10T00:00:00Z' }, // dentro del mes
      { importe_financiado: 999999, estado: 'activo', created_at: '2026-06-01T00:00:00Z' }, // afuera
    ];
    const r = resumenFinanciacionDe(planes, [], [], INICIO_MES, FIN_MES, HOY);
    expect(r.nuevosCreditosPeriodo).toBe(100000);
  });

  it('vencido y saldoPendiente: solo cuotas pendientes, la vencida se cuenta aparte de la que no', () => {
    const cuotas = [
      { importe_original: 10000, importe_pagado: 0, estado: 'pendiente', fecha_vencimiento: '2026-08-01' }, // ya venció
      { importe_original: 15000, importe_pagado: 5000, estado: 'pendiente', fecha_vencimiento: '2026-09-01' }, // todavía no
      { importe_original: 20000, importe_pagado: 20000, estado: 'pagada', fecha_vencimiento: '2026-07-01' }, // pagada, no cuenta
    ];
    const r = resumenFinanciacionDe([], cuotas, [], INICIO_MES, FIN_MES, HOY);
    expect(r.saldoPendiente).toBe(10000 + 10000); // 10000 vencida + (15000-5000) no vencida
    expect(r.vencido).toBe(10000);
  });

  it('proximasAVencer cuenta cuotas pendientes que vencen dentro de los próximos 7 días, no más', () => {
    const cuotas = [
      { importe_original: 1000, importe_pagado: 0, estado: 'pendiente', fecha_vencimiento: '2026-08-22' }, // en 3 días
      { importe_original: 1000, importe_pagado: 0, estado: 'pendiente', fecha_vencimiento: '2026-09-01' }, // en 13 días, no cuenta
      { importe_original: 1000, importe_pagado: 0, estado: 'pendiente', fecha_vencimiento: '2026-08-19' }, // hoy mismo, cuenta
    ];
    const r = resumenFinanciacionDe([], cuotas, [], INICIO_MES, FIN_MES, HOY);
    expect(r.proximasAVencer).toBe(2);
  });

  it('cobradoPeriodo solo suma pagos con fecha real dentro del rango (pago anticipado se cuenta en su fecha real)', () => {
    const pagos = [
      { monto_aplicado: 5000, created_at: '2026-08-15T00:00:00Z' }, // dentro
      { monto_aplicado: 9999, created_at: '2026-07-15T00:00:00Z' }, // afuera
    ];
    const r = resumenFinanciacionDe([], [], pagos, INICIO_MES, FIN_MES, HOY);
    expect(r.cobradoPeriodo).toBe(5000);
  });

  it('pctMorosidad = vencido / saldoPendiente, sin dividir por cero', () => {
    const cuotas = [{ importe_original: 10000, importe_pagado: 0, estado: 'pendiente', fecha_vencimiento: '2026-08-01' }];
    const r = resumenFinanciacionDe([], cuotas, [], INICIO_MES, FIN_MES, HOY);
    expect(r.pctMorosidad).toBe(100);
    const rSinSaldo = resumenFinanciacionDe([], [], [], INICIO_MES, FIN_MES, HOY);
    expect(rSinSaldo.pctMorosidad).toBe(0);
  });
});

describe('resumenComisionesDe', () => {
  const INICIO_MES = new Date(2026, 7, 1, 0, 0, 0, 0);
  const FIN_MES = new Date(2026, 7, 19, 12, 0, 0, 0);

  it('sin movimientos: hayDatos en false', () => {
    const r = resumenComisionesDe([], INICIO_MES, FIN_MES);
    expect(r.hayDatos).toBe(false);
  });

  it('generada suma todo lo del período; pagada y pendiente se separan por estado', () => {
    const movs = [
      { comision: 1000, estado: 'pagada', fecha_hecho: '2026-08-05', created_at: '2026-08-05' },
      { comision: 2000, estado: 'generada', fecha_hecho: '2026-08-10', created_at: '2026-08-10' },
      { comision: 500, estado: 'aprobada', fecha_hecho: '2026-08-12', created_at: '2026-08-12' },
      { comision: 300, estado: 'en_liquidacion', fecha_hecho: '2026-08-15', created_at: '2026-08-15' },
    ];
    const r = resumenComisionesDe(movs, INICIO_MES, FIN_MES);
    expect(r.generada).toBe(3800);
    expect(r.pagada).toBe(1000);
    expect(r.pendiente).toBe(2800); // generada + aprobada + en_liquidacion
  });

  it('usa fecha_hecho cuando existe, y cae a created_at si es null', () => {
    const movs = [
      { comision: 1000, estado: 'pagada', fecha_hecho: null, created_at: '2026-08-05' }, // dentro, por created_at
      { comision: 2000, estado: 'pagada', fecha_hecho: '2026-06-01', created_at: '2026-08-10' }, // afuera, por fecha_hecho
    ];
    const r = resumenComisionesDe(movs, INICIO_MES, FIN_MES);
    expect(r.generada).toBe(1000);
  });

  it('movimientos fuera del rango no se cuentan', () => {
    const movs = [{ comision: 5000, estado: 'pagada', fecha_hecho: '2026-05-01', created_at: '2026-05-01' }];
    const r = resumenComisionesDe(movs, INICIO_MES, FIN_MES);
    expect(r.generada).toBe(0);
    expect(r.hayDatos).toBe(true); // el array no está vacío, aunque nada caiga en el período
  });
});
