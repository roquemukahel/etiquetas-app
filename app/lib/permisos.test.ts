import { describe, expect, it } from 'vitest';
import { tienePermiso } from './permisos';
import type { Actor, Permisos } from './actor';

const base: Permisos = {
  esAdministrador: false,
  accesoCompleto: false,
  puedeVender: true,
  puedeEliminar: false,
  puedeAgregarStock: false,
  puedeVerEstadisticas: false,
  puedeRecibirServicioTecnico: true,
  puedeGestionarServicioTecnico: false,
  puedeGestionarFinanciacion: false,
};
const actor = (p: Partial<Permisos>): Actor => ({ tipo: 'vendedor', id: '1', nombre: 'Vendedora', permisos: { ...base, ...p } });

describe('permisos sensibles (costos, egresos, pagos a proveedores)', () => {
  it('el administrador siempre los tiene', () => {
    const admin = actor({ esAdministrador: true });
    expect(tienePermiso(admin, 'ver_costos')).toBe(true);
    expect(tienePermiso(admin, 'cargar_egresos')).toBe(true);
    expect(tienePermiso(admin, 'registrar_pagos_proveedores')).toBe(true);
  });

  it('ver costos arranca apagado: ni el acceso completo lo da', () => {
    expect(tienePermiso(actor({}), 'ver_costos')).toBe(false);
    expect(tienePermiso(actor({ accesoCompleto: true }), 'ver_costos')).toBe(false);
    expect(tienePermiso(actor({ puedeVerCostos: true }), 'ver_costos')).toBe(true);
  });

  it('un actor guardado sin esos datos cuenta como "no"', () => {
    expect(tienePermiso(actor({ puedeVerCostos: undefined, puedeCargarEgresos: undefined, puedeRegistrarPagosProveedores: undefined }), 'ver_costos')).toBe(false);
    expect(tienePermiso(actor({}), 'cargar_egresos')).toBe(false);
    expect(tienePermiso(actor({}), 'registrar_pagos_proveedores')).toBe(false);
  });

  it('cargar egresos y registrar pagos son permisos propios, sin dar acceso a Egresos completo ni Proveedores completo', () => {
    const vendedora = actor({ puedeCargarEgresos: true, puedeRegistrarPagosProveedores: true });
    expect(tienePermiso(vendedora, 'cargar_egresos')).toBe(true);
    expect(tienePermiso(vendedora, 'registrar_pagos_proveedores')).toBe(true);
    expect(tienePermiso(vendedora, 'gestionar_egresos')).toBe(false);
    expect(tienePermiso(vendedora, 'ver_proveedores')).toBe(false);
    expect(tienePermiso(vendedora, 'ver_estadisticas')).toBe(false);
    expect(tienePermiso(vendedora, 'ver_costos')).toBe(false);
  });

  it('sin actor elegido todavía no se restringe nada (igual que antes)', () => {
    expect(tienePermiso(null, 'ver_costos')).toBe(true);
  });
});
