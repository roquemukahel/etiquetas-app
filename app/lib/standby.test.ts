import { describe, expect, it } from 'vitest';
import { buscarEnIndice, buscarEnStandby, diasEnStandby, indexarStandby, ordenarStandby, type EquipoStandby } from './standby';
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
