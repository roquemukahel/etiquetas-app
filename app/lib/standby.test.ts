import { describe, expect, it } from 'vitest';
import {
  buscarEnIndice,
  buscarEnStandby,
  contarPorOrigen,
  esAntiguoEnStandby,
  ordenarStandbyPor,
  derivarStandbyAServicio,
  diasEnStandby,
  ERR_YA_NO_ESTA_EN_STANDBY,
  ERR_YA_NO_ESTA_EN_STOCK,
  indexarStandby,
  mandarAStandby,
  ordenarStandby,
  volverAlStock,
  type EquipoStandby,
} from './standby';
import { coincidenciasPorImeiOModelo } from './canje';

function equipo(p: Partial<EquipoStandby>): EquipoStandby {
  return {
    id: p.id ?? 'x',
    modelo: null,
    capacidad_gb: null,
    color: null,
    imei: null,
    numero_serie: null,
    salud_bateria: null,
    precio: null,
    costo: null,
    estado: 'usado',
    detalles: null,
    en_espera_desde: null,
    espera_origen: null,
    espera_motivo: null,
    sucursal_id: null,
    created_at: '2026-10-01T00:00:00Z',
    ...p,
  };
}

const lista = [
  equipo({ id: 'a', modelo: 'iPhone 13', capacidad_gb: 128, color: 'Negro', imei: '352999111222333', espera_motivo: 'Pantalla rota' }),
  equipo({ id: 'b', modelo: 'iPhone 13 Pro', capacidad_gb: 256, color: 'Azul', imei: '352888777666555', espera_origen: 'canje', detalles: 'Face ID no anda' }),
  equipo({ id: 'c', modelo: 'Galaxy A16', capacidad_gb: 128, color: 'Gris' }),
];

describe('buscador de Standby', () => {
  it('sin texto devuelve todo', () => {
    expect(buscarEnStandby(lista, '  ')).toHaveLength(3);
  });
  it('cada palabra tiene que estar en algún dato del equipo, en cualquier orden', () => {
    expect(buscarEnStandby(lista, '13 negro 128').map((e) => e.id)).toEqual(['a']);
    expect(buscarEnStandby(lista, 'iphone').map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('ignora mayúsculas y acentos, y busca por IMEI, motivo, detalles y origen', () => {
    expect(buscarEnStandby(lista, 'PANTALLA').map((e) => e.id)).toEqual(['a']);
    expect(buscarEnStandby(lista, '888777').map((e) => e.id)).toEqual(['b']);
    expect(buscarEnStandby(lista, 'face id').map((e) => e.id)).toEqual(['b']);
    expect(buscarEnStandby(lista, 'plan canje').map((e) => e.id)).toEqual(['b']);
    expect(buscarEnStandby(lista, '128gb').map((e) => e.id)).toEqual(['a', 'c']);
  });
  it('si nada coincide devuelve vacío', () => {
    expect(buscarEnStandby(lista, 'motorola')).toEqual([]);
  });
});

describe('orden y días en Standby', () => {
  it('el que más espera va primero', () => {
    const o = ordenarStandby([
      equipo({ id: 'nuevo', modelo: 'iPhone 14', en_espera_desde: '2026-10-20T00:00:00Z' }),
      equipo({ id: 'viejo', modelo: 'iPhone 14', en_espera_desde: '2026-09-01T00:00:00Z' }),
    ]);
    expect(o.map((e) => e.id)).toEqual(['viejo', 'nuevo']);
  });
  it('cuenta días completos y nunca da negativo', () => {
    const ahora = new Date('2026-10-22T12:00:00Z');
    expect(diasEnStandby('2026-10-20T00:00:00Z', ahora)).toBe(2);
    expect(diasEnStandby('2026-10-23T00:00:00Z', ahora)).toBe(0);
    expect(diasEnStandby(null, ahora)).toBe(0);
  });
});

describe('aviso al cargar un equipo que ya está en Standby', () => {
  const enStandby = [equipo({ id: 'a', modelo: 'iPhone 13', imei: '353512345678901' }), equipo({ id: 'b', modelo: 'iPhone 13', imei: null })];
  it('aparece con el comienzo del IMEI y se va cuando algún dígito deja de coincidir', () => {
    expect(coincidenciasPorImeiOModelo(enStandby, '3535', '').porImei.map((e) => e.id)).toEqual(['a']);
    expect(coincidenciasPorImeiOModelo(enStandby, '353512', '').porImei.map((e) => e.id)).toEqual(['a']);
    expect(coincidenciasPorImeiOModelo(enStandby, '35354', '').porImei).toEqual([]);
  });
  it('sin IMEI tipeado avisa por modelo; con un IMEI distinto, no', () => {
    expect(coincidenciasPorImeiOModelo(enStandby, '', 'iPhone 13').porModelo.map((e) => e.id)).toEqual(['a', 'b']);
    expect(coincidenciasPorImeiOModelo(enStandby, '999988', 'iPhone 13').porModelo.map((e) => e.id)).toEqual(['b']);
  });
});

describe('rendimiento con muchos equipos en Standby', () => {
  const modelos = ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14 Pro', 'Galaxy A16', 'Moto G54'];
  const colores = ['Negro', 'Azul', 'Rojo', 'Verde', 'Blanco'];
  const muchos = Array.from({ length: 5000 }, (_, i) =>
    equipo({
      id: `e${i}`,
      modelo: modelos[i % modelos.length],
      capacidad_gb: [64, 128, 256][i % 3],
      color: colores[i % colores.length],
      imei: String(350000000000000 + i),
      espera_motivo: i % 7 === 0 ? 'Pantalla rota' : 'Batería hinchada',
      en_espera_desde: new Date(2026, 0, 1 + (i % 200)).toISOString(),
    })
  );

  it('armar el índice, buscar y ordenar 5.000 equipos es instantáneo', () => {
    const t0 = performance.now();
    const indice = indexarStandby(muchos);
    const t1 = performance.now();
    const encontrados = ordenarStandby(buscarEnIndice(indice, 'iphone 13 negro pantalla'));
    const t2 = performance.now();
    expect(encontrados.length).toBeGreaterThan(0);
    // Cotas muy holgadas (en una compu lenta de CI): el índice se arma una vez, cada búsqueda posterior es chica.
    expect(t1 - t0).toBeLessThan(1500);
    expect(t2 - t1).toBeLessThan(300);
  });

  it('la búsqueda por IMEI parcial entre 5.000 equipos devuelve solo los que coinciden', () => {
    const indice = indexarStandby(muchos);
    const r = buscarEnIndice(indice, '35000000000420');
    expect(r.length).toBe(10); // ...4200 a ...4209
  });
});

// Cliente de Supabase de mentira: cada consulta devuelve lo que se le indique y anota los filtros aplicados.
function clienteFalso(respuestas: { data: unknown; error: { message: string } | null }[]) {
  const llamadas: { tabla: string; filtros: [string, unknown][]; cambios?: unknown }[] = [];
  let i = 0;
  const from = (tabla: string) => {
    const reg: { tabla: string; filtros: [string, unknown][]; cambios?: unknown } = { tabla, filtros: [] };
    llamadas.push(reg);
    const q: Record<string, unknown> = {};
    const respuesta = () => Promise.resolve(respuestas[Math.min(i++, respuestas.length - 1)]);
    q.update = (c: unknown) => ((reg.cambios = c), q);
    q.insert = (c: unknown) => ((reg.cambios = c), q);
    q.eq = (col: string, v: unknown) => (reg.filtros.push([col, v]), q);
    q.select = () => q;
    q.single = () => respuesta();
    q.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => respuesta().then(ok, ko);
    return q;
  };
  return { supabase: { from, rpc: () => Promise.resolve({ data: null, error: null }) } as unknown as Parameters<typeof volverAlStock>[0], llamadas };
}

describe('guardas contra movimientos simultáneos', () => {
  const eq = { id: 'x', modelo: 'iPhone 13', imei: '3535' };

  it('volver al Stock solo si sigue en Standby: si otra persona ya lo movió, avisa y no registra nada', async () => {
    const { supabase, llamadas } = clienteFalso([{ data: [], error: null }]);
    const r = await volverAlStock(supabase, eq);
    expect(r.error).toBe(ERR_YA_NO_ESTA_EN_STANDBY);
    expect(llamadas[0].filtros).toContainEqual(['en_espera', true]);
  });

  it('mandar a Standby solo si sigue en el Stock: un equipo ya vendido no se puede mandar', async () => {
    const { supabase, llamadas } = clienteFalso([{ data: [], error: null }]);
    const r = await mandarAStandby(supabase, eq, { origen: 'stock', motivo: 'pantalla' });
    expect(r.error).toBe(ERR_YA_NO_ESTA_EN_STOCK);
    expect(llamadas[0].filtros).toContainEqual(['en_stock', true]);
  });

  it('derivar a Servicio Técnico: si el equipo ya no está en Standby no se crea ninguna orden', async () => {
    const { supabase, llamadas } = clienteFalso([{ data: [], error: null }]);
    const r = await derivarStandbyAServicio(supabase, equipo({ id: 'x', modelo: 'iPhone 13' }));
    expect(r.error).toBe(ERR_YA_NO_ESTA_EN_STANDBY);
    expect(llamadas.map((l) => l.tabla)).toEqual(['dispositivos']); // nunca llegó a tocar reparaciones
  });
});

describe('orden, antigüedad y origen de la lista de Standby', () => {
  const ordenado = [
    equipo({ id: 'viejo', modelo: 'iPhone 13', en_espera_desde: '2026-08-01T00:00:00Z' }),
    equipo({ id: 'medio', modelo: 'iPhone 11', en_espera_desde: '2026-09-15T00:00:00Z' }),
    equipo({ id: 'nuevo', modelo: 'iPhone 15', en_espera_desde: '2026-10-20T00:00:00Z' }),
  ];
  it('antiguos: el que más tiempo lleva esperando primero', () => {
    expect(ordenarStandbyPor(ordenado, 'antiguos').map((e) => e.id)).toEqual(['viejo', 'medio', 'nuevo']);
  });
  it('recientes: al revés', () => {
    expect(ordenarStandbyPor(ordenado, 'recientes').map((e) => e.id)).toEqual(['nuevo', 'medio', 'viejo']);
  });
  it('modelo: en el orden de salida del catálogo, no alfabético', () => {
    expect(ordenarStandbyPor(ordenado, 'modelo').map((e) => e.modelo)).toEqual(['iPhone 11', 'iPhone 13', 'iPhone 15']);
  });
  it('no modifica la lista original', () => {
    const copia = ordenado.map((e) => e.id);
    ordenarStandbyPor(ordenado, 'recientes');
    expect(ordenado.map((e) => e.id)).toEqual(copia);
  });
  it('un equipo es antiguo a partir de los 30 días en Standby', () => {
    const ahora = new Date('2026-10-30T00:00:00Z');
    expect(esAntiguoEnStandby({ en_espera_desde: '2026-09-30T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }, ahora)).toBe(true);
    expect(esAntiguoEnStandby({ en_espera_desde: '2026-10-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }, ahora)).toBe(false);
  });
  it('si no tiene fecha de espera, cuenta desde que se cargó', () => {
    const ahora = new Date('2026-10-30T00:00:00Z');
    expect(esAntiguoEnStandby({ en_espera_desde: null, created_at: '2026-01-01T00:00:00Z' }, ahora)).toBe(true);
  });
  it('cuenta los equipos por origen y agrupa los que no tienen', () => {
    const cuenta = contarPorOrigen([
      { espera_origen: 'stock' },
      { espera_origen: 'stock' },
      { espera_origen: 'canje' },
      { espera_origen: null },
    ]);
    expect(cuenta).toEqual({ stock: 2, canje: 1, servicio_tecnico: 0, manual: 0, sin_origen: 1 });
  });
});
