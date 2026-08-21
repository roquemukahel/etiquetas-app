import { describe, it, expect } from 'vitest';
import {
  redondear,
  sumarMesConClamp,
  generarCronograma,
  estadoVisualCuota,
  aplicarPagoACuotas,
  proyeccionMensual,
  alertasCuotas,
  aFechaISO,
  type CuotaParaAplicar,
  type CuotaProyeccion,
  type PagoAplicadoProyeccion,
} from './motor';

describe('redondear', () => {
  it('half-up determinista, sin drift de binario flotante', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(redondear(-1.005, 2)).toBe(-1.01);
  });
  it('0 decimales (moneda sin centavos, ej. ARS en la práctica del negocio)', () => {
    expect(redondear(1499.6, 0)).toBe(1500);
  });
});

describe('sumarMesConClamp — fin de mes', () => {
  it('31 de enero + 1 mes → 28 de febrero (año no bisiesto)', () => {
    const r = sumarMesConClamp(new Date(2027, 0, 31), 1);
    expect(r.getFullYear()).toBe(2027);
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });
  it('31 de enero + 1 mes → 29 de febrero (año bisiesto)', () => {
    const r = sumarMesConClamp(new Date(2028, 0, 31), 1);
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(29);
  });
  it('día que sí existe en el mes siguiente: se mantiene igual', () => {
    const r = sumarMesConClamp(new Date(2026, 7, 15), 1);
    expect(r.getMonth()).toBe(8);
    expect(r.getDate()).toBe(15);
  });
  it('30 de enero + 1 mes → 28 de febrero (no rebota a marzo)', () => {
    const r = sumarMesConClamp(new Date(2027, 0, 30), 1);
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });
});

describe('generarCronograma', () => {
  it('divide exacto: 5 cuotas de $200.000 sobre $1.000.000 (ejemplo obligatorio de la spec)', () => {
    const c = generarCronograma({ importeFinanciado: 1000000, cantidadCuotas: 5, primeraFecha: '2026-09-01', decimales: 0 });
    expect(c).toHaveLength(5);
    expect(c.map((x) => x.importe)).toEqual([200000, 200000, 200000, 200000, 200000]);
    expect(c.map((x) => x.fecha_vencimiento)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
    expect(c.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it('no divide exacto: el resto del redondeo va a la ÚLTIMA cuota, la suma da exacto', () => {
    const c = generarCronograma({ importeFinanciado: 1000, cantidadCuotas: 3, primeraFecha: '2026-01-01', decimales: 2 });
    // 1000/3 = 333.333... → 333.33, 333.33, y la última absorbe el resto: 333.34
    expect(c[0].importe).toBe(333.33);
    expect(c[1].importe).toBe(333.33);
    expect(c[2].importe).toBe(333.34);
    const suma = c.reduce((a, x) => a + x.importe, 0);
    expect(Math.round(suma * 100) / 100).toBe(1000);
  });

  it('mantiene el mismo día del mes en cada cuota siguiente', () => {
    const c = generarCronograma({ importeFinanciado: 300, cantidadCuotas: 3, primeraFecha: '2026-03-15', decimales: 0 });
    expect(c.map((x) => x.fecha_vencimiento)).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
  });

  it('respeta el clamp de fin de mes a lo largo de varios meses (31 de enero, 5 cuotas)', () => {
    const c = generarCronograma({ importeFinanciado: 500, cantidadCuotas: 5, primeraFecha: '2026-01-31', decimales: 0 });
    expect(c.map((x) => x.fecha_vencimiento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('una sola cuota = venta con un único vencimiento', () => {
    const c = generarCronograma({ importeFinanciado: 5000, cantidadCuotas: 1, primeraFecha: '2026-06-01', decimales: 0 });
    expect(c).toEqual([{ numero: 1, fecha_vencimiento: '2026-06-01', importe: 5000 }]);
  });

  it('rechaza importe o cantidad de cuotas inválidos', () => {
    expect(() => generarCronograma({ importeFinanciado: 0, cantidadCuotas: 3, primeraFecha: '2026-01-01', decimales: 0 })).toThrow();
    expect(() => generarCronograma({ importeFinanciado: 100, cantidadCuotas: 0, primeraFecha: '2026-01-01', decimales: 0 })).toThrow();
  });
});

describe('estadoVisualCuota', () => {
  const HOY = new Date(2026, 7, 19); // 19/8/2026, mismo "ahora" que datos.test.ts

  it('pendiente: falta bastante para vencer, sin pagos', () => {
    const c = { fecha_vencimiento: '2026-09-15', importe_original: 1000, importe_pagado: 0, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('pendiente');
  });
  it('próxima a vencer: dentro de los próximos 7 días', () => {
    const c = { fecha_vencimiento: '2026-08-24', importe_original: 1000, importe_pagado: 0, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('proxima_a_vencer');
  });
  it('vence hoy', () => {
    const c = { fecha_vencimiento: '2026-08-19', importe_original: 1000, importe_pagado: 0, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('vence_hoy');
  });
  it('vencida: la fecha ya pasó y no hay pago', () => {
    const c = { fecha_vencimiento: '2026-08-01', importe_original: 1000, importe_pagado: 0, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('vencida');
  });
  it('parcialmente pagada: no vencida, con abono parcial', () => {
    const c = { fecha_vencimiento: '2026-09-15', importe_original: 1000, importe_pagado: 400, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('parcialmente_pagada');
  });
  it('parcial y vencida: la fecha pasó y quedó un saldo', () => {
    const c = { fecha_vencimiento: '2026-08-01', importe_original: 1000, importe_pagado: 400, estado: 'pendiente' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('parcial_y_vencida');
  });
  it('pagada: estado persistido manda, sin importar la fecha', () => {
    const c = { fecha_vencimiento: '2026-01-01', importe_original: 1000, importe_pagado: 1000, estado: 'pagada' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('pagada');
  });
  it('anulada: estado persistido manda', () => {
    const c = { fecha_vencimiento: '2026-01-01', importe_original: 1000, importe_pagado: 0, estado: 'anulada' as const };
    expect(estadoVisualCuota(c, HOY)).toBe('anulada');
  });
});

describe('aplicarPagoACuotas', () => {
  const HOY = new Date(2026, 7, 19);
  function cuota(over: Partial<CuotaParaAplicar>): CuotaParaAplicar {
    return { id: 'c1', fecha_vencimiento: '2026-09-01', importe_original: 1000, importe_pagado: 0, estado: 'pendiente', ...over };
  }

  it('pago completo cubre exacto una cuota', () => {
    const r = aplicarPagoACuotas({ cuotas: [cuota({ id: 'a' })], monto: 1000, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([{ cuota_id: 'a', monto: 1000 }]);
    expect(r.sobrante).toBe(0);
  });

  it('pago parcial: se aplica lo que hay, la cuota queda con saldo', () => {
    const r = aplicarPagoACuotas({ cuotas: [cuota({ id: 'a' })], monto: 400, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([{ cuota_id: 'a', monto: 400 }]);
  });

  it('un pago cubre varias cuotas cuando alcanza', () => {
    const cuotas = [cuota({ id: 'a', fecha_vencimiento: '2026-08-01' }), cuota({ id: 'b', fecha_vencimiento: '2026-09-01' })];
    const r = aplicarPagoACuotas({ cuotas, monto: 1500, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([
      { cuota_id: 'a', monto: 1000 },
      { cuota_id: 'b', monto: 500 },
    ]);
    expect(r.sobrante).toBe(0);
  });

  it('sin cuota elegida: prioriza las VENCIDAS antes que las futuras, aunque venzan después en la lista', () => {
    const cuotas = [
      cuota({ id: 'futura', fecha_vencimiento: '2026-09-01' }), // no vencida
      cuota({ id: 'vencida', fecha_vencimiento: '2026-07-01' }), // vencida
    ];
    const r = aplicarPagoACuotas({ cuotas, monto: 1000, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([{ cuota_id: 'vencida', monto: 1000 }]);
  });

  it('con cuota elegida a mano: se aplica solo ahí, sin tocar otras aunque sobre', () => {
    const cuotas = [cuota({ id: 'a', fecha_vencimiento: '2026-08-01' }), cuota({ id: 'b', fecha_vencimiento: '2026-09-01' })];
    const r = aplicarPagoACuotas({ cuotas, monto: 1500, decimales: 0, hoy: HOY, cuotaIdElegida: 'b' });
    expect(r.asignaciones).toEqual([{ cuota_id: 'b', monto: 1000 }]);
    expect(r.sobrante).toBe(500);
  });

  it('ignora cuotas ya pagadas o anuladas', () => {
    const cuotas = [cuota({ id: 'pagada', estado: 'pagada', importe_pagado: 1000 }), cuota({ id: 'pendiente' })];
    const r = aplicarPagoACuotas({ cuotas, monto: 1000, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([{ cuota_id: 'pendiente', monto: 1000 }]);
  });

  it('monto 0 o negativo no genera asignaciones', () => {
    const r = aplicarPagoACuotas({ cuotas: [cuota({})], monto: 0, decimales: 0, hoy: HOY });
    expect(r.asignaciones).toEqual([]);
  });
});

describe('proyeccionMensual — ejemplo obligatorio de la spec', () => {
  // "Una venta de $1.000.000 financiada en 5 cuotas mensuales de $200.000"
  // desde el mes 1, más "una financiación de $300.000 en 3 cuotas de
  // $100.000 desde el segundo mes" → mes 1: 200k, mes 2: 300k, mes 3: 300k,
  // mes 4: 300k, mes 5: 200k.
  const HOY = new Date(2026, 0, 10); // "hoy" = 10/1/2026, dentro del mes 1

  function cuotasPlanA(): CuotaProyeccion[] {
    const fechas = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05'];
    return fechas.map((f) => ({ cliente_id: 'clienteA', moneda: 'ARS', fecha_vencimiento: f, importe_original: 200000, importe_pagado: 0, estado: 'pendiente' as const }));
  }
  function cuotasPlanB(): CuotaProyeccion[] {
    // "desde el segundo mes" → primera cuota en febrero.
    const fechas = ['2026-02-10', '2026-03-10', '2026-04-10'];
    return fechas.map((f) => ({ cliente_id: 'clienteB', moneda: 'ARS', fecha_vencimiento: f, importe_original: 100000, importe_pagado: 0, estado: 'pendiente' as const }));
  }

  it('programado por mes coincide con el ejemplo de la spec', () => {
    const cuotas = [...cuotasPlanA(), ...cuotasPlanB()];
    const res = proyeccionMensual({ cuotas, pagosAplicados: [], horizonteMeses: 5, hoy: HOY, decimales: 0 });
    const porMes = Object.fromEntries(res.map((m) => [m.mes, m.programado]));
    expect(porMes['2026-01']).toBe(200000);
    expect(porMes['2026-02']).toBe(300000);
    expect(porMes['2026-03']).toBe(300000);
    expect(porMes['2026-04']).toBe(300000);
    expect(porMes['2026-05']).toBe(200000);
  });

  it('pago anticipado: se computa "cobrado" en el mes REAL del pago, no en el mes de la cuota, y baja el pendiente de ese mes', () => {
    // La cuota de febrero de $200.000 (plan A) se paga anticipadamente en enero.
    const cuotas = cuotasPlanA().map((c) => (c.fecha_vencimiento === '2026-02-05' ? { ...c, importe_pagado: 200000 } : c));
    const pagos: PagoAplicadoProyeccion[] = [{ cliente_id: 'clienteA', moneda: 'ARS', fecha_pago: '2026-01-15', monto: 200000 }];
    const res = proyeccionMensual({ cuotas, pagosAplicados: pagos, horizonteMeses: 5, hoy: HOY, decimales: 0 });
    const enero = res.find((m) => m.mes === '2026-01')!;
    const febrero = res.find((m) => m.mes === '2026-02')!;
    expect(enero.cobrado).toBe(200000); // el dinero entró en enero de verdad
    expect(enero.programado).toBe(200000); // el cronograma de enero no cambia
    expect(febrero.programado).toBe(200000); // la cuota histórica de febrero se sigue mostrando
    expect(febrero.pendiente).toBe(0); // pero ya no queda nada pendiente de cobrar en febrero
    expect(febrero.cobrado).toBe(0); // el cobro NO se le asigna al mes de la cuota
  });

  it('vencido: dentro del mes actual, la cuota cuyo vencimiento ya pasó cuenta como vencida; la que todavía no vence, no', () => {
    // El horizonte arranca siempre en el mes de "hoy" (nunca muestra meses
    // pasados enteros — esos ya están en el "Total vencido" general, aparte).
    // Acá "hoy" cae DESPUÉS del vencimiento del 5/1 pero es del mismo mes.
    const hoy = new Date(2026, 0, 20); // 20/1/2026
    const cuotas = cuotasPlanA(); // cuota de enero vence el 5/1, la de febrero el 5/2
    const res = proyeccionMensual({ cuotas, pagosAplicados: [], horizonteMeses: 5, hoy, decimales: 0 });
    expect(res.find((m) => m.mes === '2026-01')!.vencido).toBe(200000); // 5/1 ya pasó
    expect(res.find((m) => m.mes === '2026-02')!.vencido).toBe(0); // 5/2 todavía no llegó
  });

  it('separa por moneda: nunca suma ARS con USD', () => {
    const cuotas: CuotaProyeccion[] = [
      { cliente_id: 'a', moneda: 'ARS', fecha_vencimiento: '2026-01-05', importe_original: 1000, importe_pagado: 0, estado: 'pendiente' },
      { cliente_id: 'b', moneda: 'USD', fecha_vencimiento: '2026-01-05', importe_original: 50, importe_pagado: 0, estado: 'pendiente' },
    ];
    const res = proyeccionMensual({ cuotas, pagosAplicados: [], horizonteMeses: 1, hoy: HOY, decimales: 0 });
    expect(res).toHaveLength(2);
    const ars = res.find((m) => m.moneda === 'ARS')!;
    const usd = res.find((m) => m.moneda === 'USD')!;
    expect(ars.programado).toBe(1000);
    expect(usd.programado).toBe(50);
  });

  it('cuotas anuladas no cuentan para nada de la proyección', () => {
    const cuotas: CuotaProyeccion[] = [{ cliente_id: 'a', moneda: 'ARS', fecha_vencimiento: '2026-01-05', importe_original: 1000, importe_pagado: 0, estado: 'anulada' }];
    const res = proyeccionMensual({ cuotas, pagosAplicados: [], horizonteMeses: 1, hoy: HOY, decimales: 0 });
    expect(res).toEqual([]);
  });

  it('cuenta clientes únicos por mes, no cuotas', () => {
    const cuotas: CuotaProyeccion[] = [
      { cliente_id: 'a', moneda: 'ARS', fecha_vencimiento: '2026-01-05', importe_original: 100, importe_pagado: 0, estado: 'pendiente' },
      { cliente_id: 'a', moneda: 'ARS', fecha_vencimiento: '2026-01-20', importe_original: 100, importe_pagado: 0, estado: 'pendiente' },
      { cliente_id: 'b', moneda: 'ARS', fecha_vencimiento: '2026-01-10', importe_original: 100, importe_pagado: 0, estado: 'pendiente' },
    ];
    const res = proyeccionMensual({ cuotas, pagosAplicados: [], horizonteMeses: 1, hoy: HOY, decimales: 0 });
    expect(res[0].cantidadCuotas).toBe(3);
    expect(res[0].cantidadClientes).toBe(2);
  });
});

describe('alertasCuotas', () => {
  const HOY = new Date(2026, 7, 19); // 19/8/2026
  function cuota(over: any = {}) {
    return {
      id: 'c1',
      cliente_id: 'cl1',
      clienteNombre: 'Juan Pérez',
      plan_id: 'p1',
      numero: 1,
      cuotaTotal: 3,
      moneda: 'ARS',
      fecha_vencimiento: '2026-09-01',
      importe_original: 1000,
      importe_pagado: 0,
      estado: 'pendiente' as const,
      ...over,
    };
  }

  it('incluye vence-hoy, próxima a vencer y vencida; ignora pendiente lejana/pagada/anulada', () => {
    const cuotas = [
      cuota({ id: 'a', fecha_vencimiento: '2026-08-19' }), // vence hoy
      cuota({ id: 'b', fecha_vencimiento: '2026-08-22' }), // próxima a vencer
      cuota({ id: 'c', fecha_vencimiento: '2026-08-01' }), // vencida
      cuota({ id: 'd', fecha_vencimiento: '2026-12-01' }), // lejana, no alerta
      cuota({ id: 'e', fecha_vencimiento: '2026-08-01', estado: 'pagada', importe_pagado: 1000 }), // pagada, no alerta
      cuota({ id: 'f', fecha_vencimiento: '2026-08-01', estado: 'anulada' }), // anulada, no alerta
    ];
    const alertas = alertasCuotas(cuotas, HOY);
    expect(alertas.map((a) => a.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('las vencidas van primero, con los días de atraso calculados', () => {
    const cuotas = [cuota({ id: 'a', fecha_vencimiento: '2026-08-19' }), cuota({ id: 'b', fecha_vencimiento: '2026-08-09' })];
    const alertas = alertasCuotas(cuotas, HOY);
    expect(alertas[0].id).toBe('b');
    expect(alertas[0].categoria).toBe('vencida');
    expect(alertas[0].diasAtraso).toBe(10);
    expect(alertas[1].diasAtraso).toBeNull();
  });

  it('cada alerta trae cliente, importe (saldo pendiente, no el original), número de cuota y total', () => {
    const alertas = alertasCuotas([cuota({ id: 'a', fecha_vencimiento: '2026-08-01', importe_pagado: 400 })], HOY);
    expect(alertas[0]).toMatchObject({ clienteNombre: 'Juan Pérez', importe: 600, cuotaNumero: 1, cuotaTotal: 3 });
  });

  it('nunca duplica: una cuota aparece como máximo una vez (id = cuota_id)', () => {
    const alertas = alertasCuotas([cuota({ id: 'a', fecha_vencimiento: '2026-08-01' })], HOY);
    expect(new Set(alertas.map((a) => a.id)).size).toBe(alertas.length);
  });
});

describe('aFechaISO', () => {
  it('formatea sin desfasarse por UTC', () => {
    expect(aFechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(aFechaISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
