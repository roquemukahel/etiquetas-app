import { describe, expect, it } from 'vitest';
import { bloqueVentas, bloqueVentasPorArea, costoDeLinea, type ItemAreaR, type OrdenR } from './datos';

const desde = new Date(2026, 10, 1);
const hasta = new Date(2026, 10, 30, 23, 59, 59);
const orden = (id: string, total: number): OrdenR => ({
  id,
  vendedor_id: null,
  cliente_id: null,
  total,
  anticipo: 0,
  monto_canje: 0,
  estado: 'pagado',
  forma_pago: 'Efectivo',
  created_at: new Date(2026, 10, 10, 12).toISOString(),
  sucursal_id: null,
});

describe('costo de una línea', () => {
  it('usa el costo cargado', () => {
    expect(costoDeLinea({ costo: 40, tipo: 'producto' })).toBe(40);
    expect(costoDeLinea({ costo: 0, tipo: 'trabajo' })).toBe(0);
  });
  it('una línea de taller sin costo cuesta cero (mano de obra)', () => {
    expect(costoDeLinea({ costo: null, tipo: 'trabajo' })).toBe(0);
  });
  it('un producto o dispositivo sin costo NO inventa uno', () => {
    expect(costoDeLinea({ costo: null, tipo: 'producto' })).toBeNull();
    expect(costoDeLinea({ costo: null, tipo: 'dispositivo' })).toBeNull();
    expect(costoDeLinea({ costo: null })).toBeNull();
  });
});

describe('el resultado de taller no queda en cero por falta de costo', () => {
  const items = new Map<string, ItemAreaR[]>([
    ['o1', [{ orden_id: 'o1', cantidad: 1, precio_unitario: 80, costo: null, tipo: 'trabajo' }]],
    ['o2', [{ orden_id: 'o2', cantidad: 1, precio_unitario: 100, costo: 60, tipo: 'producto' }]],
  ]);
  const ordenes = [orden('o1', 80), orden('o2', 100)];

  it('la ganancia de taller es toda la mano de obra', () => {
    expect(bloqueVentasPorArea(ordenes, items, desde, hasta, true)).toEqual({ ventas: 80, ventasConCosto: 80, ganancia: 80 });
  });
  it('la ganancia de local no cambia', () => {
    expect(bloqueVentasPorArea(ordenes, items, desde, hasta, false)).toEqual({ ventas: 100, ventasConCosto: 100, ganancia: 40 });
  });
  it('la ganancia general suma lo mismo que local + taller (la tabla por sucursal cierra con el total)', () => {
    const general = bloqueVentas(ordenes, items, [], [], desde, hasta);
    const local = bloqueVentasPorArea(ordenes, items, desde, hasta, false);
    const taller = bloqueVentasPorArea(ordenes, items, desde, hasta, true);
    expect(general.ganancia).toBe(local.ganancia + taller.ganancia);
    expect(general.ganancia).toBe(120);
  });
});
