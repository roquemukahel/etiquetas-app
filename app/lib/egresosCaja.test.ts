import { describe, it, expect } from 'vitest';
import { egresosEnEfectivo, egresosSinMedio, saleDeLaCaja, cajaDeEgreso, type EgresoDeCaja } from './egresosCaja';

const base: EgresoDeCaja = {
  id: 'e', fecha: '2026-11-18', descripcion: 'gasto', importe: 1000, moneda: 'ARS', medio_pago: 'efectivo', tipo: 'gasto_operativo',
  created_at: '2026-11-18T12:00:00Z', sucursal_id: null, registrado_por_nombre: null,
};

describe('egresos que salen de la caja', () => {
  it('un egreso en efectivo sin caja elegida sale de Venta diaria', () => {
    expect(cajaDeEgreso(base)).toBe('venta_diaria');
    expect(saleDeLaCaja(base, 'venta_diaria')).toBe(true);
    expect(saleDeLaCaja(base, 'financiamiento')).toBe(false);
  });
  it('si se eligió Financiamiento sale de esa caja', () => {
    const e = { ...base, caja_tipo: 'financiamiento' };
    expect(saleDeLaCaja(e, 'financiamiento')).toBe(true);
    expect(saleDeLaCaja(e, 'venta_diaria')).toBe(false);
  });
  it('transferencia, débito y crédito no pasan por el cajón', () => {
    for (const m of ['transferencia', 'debito', 'credito']) expect(saleDeLaCaja({ ...base, medio_pago: m }, 'venta_diaria')).toBe(false);
  });
  it('lo pagado de la billetera de un dueño no baja la caja', () => {
    expect(saleDeLaCaja({ ...base, pagado_desde: 'billetera_dueno' }, 'venta_diaria')).toBe(false);
    expect(saleDeLaCaja({ ...base, pagado_desde: 'caja' }, 'venta_diaria')).toBe(true);
  });
  it('el retiro automático del cierre (con turno) no es un gasto del turno', () => {
    expect(saleDeLaCaja({ ...base, caja_turno_id: 't1' }, 'venta_diaria')).toBe(false);
  });
  it('suma solo los que salen de esa caja', () => {
    const lista = [base, { ...base, id: 'b', importe: 500 }, { ...base, id: 'c', medio_pago: 'transferencia', importe: 9999 }, { ...base, id: 'd', caja_tipo: 'financiamiento', importe: 70 }];
    expect(egresosEnEfectivo(lista, 'venta_diaria')).toBe(1500);
    expect(egresosEnEfectivo(lista, 'financiamiento')).toBe(70);
    expect(egresosEnEfectivo([], 'venta_diaria')).toBe(0);
  });
  it('avisa los egresos sin medio de pago, que no se pueden descontar solos', () => {
    const lista = [base, { ...base, id: 'x', medio_pago: null }, { ...base, id: 'y', medio_pago: null, pagado_desde: 'billetera_dueno' }, { ...base, id: 'z', medio_pago: null, caja_turno_id: 't' }];
    expect(egresosSinMedio(lista).map((e) => e.id)).toEqual(['x']);
  });
});
