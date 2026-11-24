import { describe, it, expect } from 'vitest';
import { resolverCostoServicio, tieneCostoPendiente, hayQuePreguntarRepuesto } from './costoRepuesto';

describe('resolverCostoServicio', () => {
  it('sin repuestos y sin respuesta: costo pendiente, no se inventa un costo cero', () => {
    expect(resolverCostoServicio(null, [])).toEqual({ costo: null, pendiente: true });
  });
  it('"pendiente de cargar" sigue pendiente mientras no haya repuestos', () => {
    expect(resolverCostoServicio('pendiente', [])).toEqual({ costo: null, pendiente: true });
  });
  it('"No usó repuesto" confirma costo cero (la mano de obra sí es ganancia entera)', () => {
    expect(resolverCostoServicio('sin_repuesto', [])).toEqual({ costo: 0, pendiente: false });
  });
  it('con repuestos cargados suma su costo y deja de estar pendiente', () => {
    expect(resolverCostoServicio('pendiente', [{ cantidad: 2, costo_unitario: 1500 }, { cantidad: 1, costo_unitario: 400 }])).toEqual({ costo: 3400, pendiente: false });
  });
  it('si a un repuesto le falta el costo, la reparación sigue con costo pendiente', () => {
    expect(resolverCostoServicio('del_stock', [{ cantidad: 1, costo_unitario: 1000 }, { cantidad: 1, costo_unitario: null }])).toEqual({ costo: null, pendiente: true });
  });
  it('los repuestos cargados mandan sobre "No usó repuesto" (se usaron de verdad)', () => {
    expect(resolverCostoServicio('sin_repuesto', [{ cantidad: 1, costo_unitario: 800 }])).toEqual({ costo: 800, pendiente: false });
  });
});

describe('tieneCostoPendiente / hayQuePreguntarRepuesto', () => {
  it('solo marca "costo pendiente" a lo respondido como pendiente', () => {
    expect(tieneCostoPendiente({ repuesto_decision: 'pendiente' })).toBe(true);
    expect(tieneCostoPendiente({ repuesto_decision: 'sin_repuesto' })).toBe(false);
    expect(tieneCostoPendiente({ repuesto_decision: null })).toBe(false);
    expect(tieneCostoPendiente({})).toBe(false);
  });
  it('pregunta solo si nadie respondió y no hay repuestos cargados', () => {
    expect(hayQuePreguntarRepuesto(null, 0)).toBe(true);
    expect(hayQuePreguntarRepuesto(undefined, 0)).toBe(true);
    expect(hayQuePreguntarRepuesto(null, 1)).toBe(false);
    expect(hayQuePreguntarRepuesto('sin_repuesto', 0)).toBe(false);
    expect(hayQuePreguntarRepuesto('pendiente', 0)).toBe(false);
  });
});
