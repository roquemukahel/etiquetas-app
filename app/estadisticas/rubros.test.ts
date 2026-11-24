import { describe, expect, it } from 'vitest';
import { comprasPorRubro, inventarioPorRubro, recuperoPorRubro, totalInventario, SIN_RUBRO } from './rubros';

const nombres: Record<string, string> = { cel: 'Celulares', acc: 'Accesorios', ele: 'Electrohogar' };
const nombreDe = (id: string | null) => (id ? nombres[id] ?? 'Rubro eliminado' : SIN_RUBRO);
const desde = new Date(2026, 9, 1);
const hasta = new Date(2026, 9, 31, 23, 59, 59);
const dentro = new Date(2026, 9, 10).toISOString();
const fuera = new Date(2026, 8, 10).toISOString();

describe('comprasPorRubro', () => {
  const compras = [
    { categoria_id: 'cel', monto: 1000, proveedor_id: 'p1', sucursal_id: 's1', fecha: dentro },
    { categoria_id: 'cel', monto: 500, proveedor_id: 'p2', sucursal_id: 's1', fecha: dentro },
    { categoria_id: 'acc', monto: 200, proveedor_id: 'p1', sucursal_id: 's2', fecha: dentro },
    { categoria_id: null, monto: 50, proveedor_id: 'p1', sucursal_id: 's1', fecha: dentro },
    { categoria_id: 'cel', monto: 9999, proveedor_id: 'p1', sucursal_id: 's1', fecha: fuera },
  ];
  it('suma por rubro dentro del período y ordena de mayor a menor', () => {
    expect(comprasPorRubro(compras, nombreDe, desde, hasta)).toEqual([
      { rubro: 'Celulares', monto: 1500 },
      { rubro: 'Accesorios', monto: 200 },
      { rubro: SIN_RUBRO, monto: 50 },
    ]);
  });
  it('filtra por proveedor y por sucursal', () => {
    expect(comprasPorRubro(compras, nombreDe, desde, hasta, { proveedorId: 'p1' })).toEqual([
      { rubro: 'Celulares', monto: 1000 },
      { rubro: 'Accesorios', monto: 200 },
      { rubro: SIN_RUBRO, monto: 50 },
    ]);
    expect(comprasPorRubro(compras, nombreDe, desde, hasta, { sucursalId: 's2' })).toEqual([{ rubro: 'Accesorios', monto: 200 }]);
  });
});

describe('inventarioPorRubro', () => {
  const stock = [
    { categoria_id: 'cel', sucursal_id: 's1', unidades: 2, costo_unitario: 100 },
    { categoria_id: 'cel', sucursal_id: 's2', unidades: 1, costo_unitario: 300 },
    { categoria_id: 'cel', sucursal_id: 's1', unidades: 1, costo_unitario: null },
    { categoria_id: 'acc', sucursal_id: 's1', unidades: 10, costo_unitario: 5 },
    { categoria_id: 'acc', sucursal_id: 's1', unidades: 0, costo_unitario: 5 },
  ];
  it('valúa a costo por rubro y por sucursal, y separa lo que no tiene costo cargado', () => {
    const r = inventarioPorRubro(stock, nombreDe);
    const cel = r.find((f) => f.rubro === 'Celulares')!;
    expect(cel.unidades).toBe(4);
    expect(cel.costoTotal).toBe(500); // 2*100 + 1*300; la unidad sin costo no suma
    expect(cel.unidadesSinCosto).toBe(1);
    expect(cel.pctSinCosto).toBe(25);
    expect(cel.porSucursal['s1']).toEqual({ unidades: 3, costoTotal: 200 });
    expect(cel.porSucursal['s2']).toEqual({ unidades: 1, costoTotal: 300 });
    expect(r.find((f) => f.rubro === 'Accesorios')!.unidades).toBe(10); // la fila con 0 unidades no cuenta
  });
  it('filtra por sucursal y totaliza', () => {
    const r = inventarioPorRubro(stock, nombreDe, 's2');
    expect(r).toHaveLength(1);
    expect(totalInventario(inventarioPorRubro(stock, nombreDe))).toMatchObject({ unidades: 14, costoTotal: 550, unidadesSinCosto: 1 });
  });
});

describe('recuperoPorRubro', () => {
  it('compara lo comprado con lo vendido, calcula margen, días de stock y % recuperado', () => {
    const filas = recuperoPorRubro({
      compras: [{ rubro: 'Celulares', monto: 1000 }],
      ventas: [
        { categoriaNombre: 'Celulares', cantidad: 2, precio_unitario: 400, costo: 250 },
        { categoriaNombre: 'Celulares', cantidad: 1, precio_unitario: 100, costo: null },
      ],
      inventario: [{ rubro: 'Celulares', unidades: 3, costoTotal: 600, unidadesSinCosto: 0, pctSinCosto: 0, porSucursal: {} }],
      dias: 10,
    });
    const cel = filas.find((f) => f.rubro === 'Celulares')!;
    expect(cel.ventas).toBe(900);
    expect(cel.costoVendido).toBe(500);
    expect(cel.margen).toBe(300); // (800 con costo) - 500
    expect(cel.pctRecuperado).toBe(90);
    expect(cel.diasDeStock).toBe(12); // 600 de stock a costo, se vende 50 de costo por día
    expect(cel.coberturaDias).toBe(10); // 3 unidades, 0,3 por día
    expect(cel.alerta).toBeNull();
  });

  it('alerta cuando un rubro con ventas se agotó o le quedan menos de 7 días', () => {
    const filas = recuperoPorRubro({
      compras: [],
      ventas: [
        { categoriaNombre: 'Accesorios', cantidad: 30, precio_unitario: 10, costo: 4 },
        { categoriaNombre: 'Celulares', cantidad: 5, precio_unitario: 100, costo: 60 },
      ],
      inventario: [{ rubro: 'Accesorios', unidades: 2, costoTotal: 8, unidadesSinCosto: 0, pctSinCosto: 0, porSucursal: {} }],
      dias: 30,
    });
    expect(filas.find((f) => f.rubro === 'Accesorios')!.alerta).toBe('por_agotarse'); // 2 u a 1 por día = 2 días
    expect(filas.find((f) => f.rubro === 'Celulares')!.alerta).toBe('agotado');
  });

  it('servicio técnico entra con su ganancia bruta, sin alertas de stock ni % recuperado', () => {
    const filas = recuperoPorRubro({
      compras: [],
      ventas: [],
      taller: { ventas: 1000, ventasConCosto: 1000, ganancia: 700 },
      inventario: [],
      dias: 30,
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ rubro: 'Servicio técnico', ventas: 1000, costoVendido: 300, margen: 700, alerta: null, pctRecuperado: null });
  });

  it('un rubro sin movimiento no aparece', () => {
    expect(recuperoPorRubro({ compras: [], ventas: [], inventario: [], dias: 30 })).toEqual([]);
  });
});
