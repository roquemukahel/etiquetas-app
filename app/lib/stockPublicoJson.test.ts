import { describe, expect, it } from 'vitest';
import { agruparStockPublico, armarStockPublicoJson, COLUMNAS_STOCK_PUBLICO_JSON, FORMATO_TOKEN, type FilaStockPublico } from './stockPublicoJson';

const fila = (p: Partial<FilaStockPublico>): FilaStockPublico => ({
  modelo: 'iPhone 13',
  capacidad_gb: 128,
  color: 'Azul',
  estado: 'usado',
  salud_bateria: 89,
  precio: 450,
  ...p,
});

describe('stock público en JSON', () => {
  it('junta los equipos iguales y cuenta la cantidad', () => {
    const items = agruparStockPublico([fila({}), fila({}), fila({})]);
    expect(items).toEqual([{ modelo: 'iPhone 13', capacidad_gb: 128, color: 'Azul', estado: 'usado', bateria: 89, cantidad: 3, precio_mayorista: 450 }]);
  });

  it('separa por batería y por precio para que cada línea tenga un dato exacto', () => {
    const items = agruparStockPublico([fila({ salud_bateria: 89 }), fila({ salud_bateria: 85 }), fila({ precio: 470 })]);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.cantidad)).toEqual([1, 1, 1]);
  });

  it('un equipo sellado no se mezcla con uno usado', () => {
    const items = agruparStockPublico([fila({ estado: 'usado' }), fila({ estado: 'sellado', salud_bateria: null })]);
    expect(items.map((i) => i.estado).sort()).toEqual(['sellado', 'usado']);
  });

  it('acepta el precio como texto (numeric de la base) y sin precio queda null', () => {
    const items = agruparStockPublico([fila({ precio: '499.50' }), fila({ modelo: 'iPhone 14', precio: null, salud_bateria: null })]);
    expect(items.find((i) => i.modelo === 'iPhone 13')?.precio_mayorista).toBe(499.5);
    expect(items.find((i) => i.modelo === 'iPhone 14')).toMatchObject({ precio_mayorista: null, bateria: null });
  });

  it('ordena por salida del modelo (no alfabético) y luego por capacidad', () => {
    const items = agruparStockPublico([
      fila({ modelo: 'iPhone 13', capacidad_gb: 256 }),
      fila({ modelo: 'iPhone 8' }),
      fila({ modelo: 'iPhone 13', capacidad_gb: 128 }),
    ]);
    expect(items.map((i) => `${i.modelo} ${i.capacidad_gb}`)).toEqual(['iPhone 8 128', 'iPhone 13 128', 'iPhone 13 256']);
  });

  it('no incluye costos, IMEI ni datos de clientes: ni en las columnas pedidas ni en lo que devuelve', () => {
    const filas = [{ ...fila({}), costo: 300, imei: '350000000000001', cliente: 'Ana' }] as unknown as FilaStockPublico[];
    const json = armarStockPublicoJson({ nombre: 'Local', moneda: 'USD' }, filas, new Date('2026-11-02T12:00:00Z'));
    const texto = JSON.stringify(json);
    expect(texto).not.toMatch(/costo|imei|350000000000001|cliente|Ana/i);
    expect(COLUMNAS_STOCK_PUBLICO_JSON).not.toMatch(/costo|imei|serie|proveedor|cliente/i);
  });

  it('arma la respuesta completa con negocio, moneda, fecha y total', () => {
    const json = armarStockPublicoJson({ nombre: 'Local', moneda: null }, [fila({}), fila({})], new Date('2026-11-02T12:00:00Z'));
    expect(json).toMatchObject({ negocio: 'Local', moneda: 'ARS', actualizado: '2026-11-02T12:00:00.000Z', total_equipos: 2 });
    expect(json.items).toHaveLength(1);
  });

  it('solo acepta tokens con formato UUID', () => {
    expect(FORMATO_TOKEN.test('09901b10-4526-413c-a335-43aa982b4f03')).toBe(true);
    expect(FORMATO_TOKEN.test("'; drop table negocios; --")).toBe(false);
    expect(FORMATO_TOKEN.test('abc')).toBe(false);
  });
});
