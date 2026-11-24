import { describe, expect, it } from 'vitest';
import { aTituloLocalidad, planUnificacionLocalidades } from './localidades';

describe('unificar localidades repetidas', () => {
  it('pone en formato título respetando "de", "del", "la"…', () => {
    expect(aTituloLocalidad('las cejas')).toBe('Las Cejas');
    expect(aTituloLocalidad('  SAN MIGUEL  DE TUCUMAN ')).toBe('San Miguel de Tucuman');
  });

  it('"las cejas" / "Las Cejas" → queda la bien escrita y se cambian las otras', () => {
    const plan = planUnificacionLocalidades([], ['Las Cejas', 'las cejas', 'Las Cejas', 'LAS CEJAS']);
    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].destino).toBe('Las Cejas');
    expect(plan.grupos[0].clientes.map((c) => c.desde).sort()).toEqual(['LAS CEJAS', 'las cejas']);
  });

  it('si la lista ya tiene la versión con acentos, esa gana sobre lo que escribieron los clientes', () => {
    const plan = planUnificacionLocalidades([{ id: '1', nombre: 'Estación Aráoz' }], ['Estacion araoz', 'ESTACION ARAOZ', 'Estación Aráoz']);
    expect(plan.grupos[0].destino).toBe('Estación Aráoz');
    expect(plan.grupos[0].clientes.map((c) => c.desde).sort()).toEqual(['ESTACION ARAOZ', 'Estacion araoz']);
    expect(plan.grupos[0].listaQuitar).toEqual([]);
    expect(plan.grupos[0].listaRenombrar).toBeNull();
  });

  it('si nadie la escribió bien, pasa a formato título', () => {
    const plan = planUnificacionLocalidades([], ['Estacion araoz', 'ESTACION ARAOZ']);
    expect(plan.grupos[0].destino).toBe('Estacion Araoz');
    expect(plan.grupos[0].clientes).toHaveLength(2);
  });

  it('una lista con la misma zona dos veces: se quita la repetida y no se toca a los clientes bien escritos', () => {
    const lista = [
      { id: '1', nombre: 'Los Ralos' },
      { id: '2', nombre: 'los ralos' },
    ];
    const plan = planUnificacionLocalidades(lista, ['Los Ralos']);
    expect(plan.grupos[0].destino).toBe('Los Ralos');
    expect(plan.grupos[0].listaQuitar.map((l) => l.id)).toEqual(['2']);
    expect(plan.grupos[0].clientes).toEqual([]);
  });

  it('una lista mal escrita se renombra a la versión del título', () => {
    const plan = planUnificacionLocalidades([{ id: '1', nombre: 'las cejas' }], ['Las Cejas']);
    expect(plan.grupos[0].destino).toBe('Las Cejas');
    expect(plan.grupos[0].listaRenombrar?.id).toBe('1');
  });

  it('lo que está escrito de una sola forma no se toca; espacios de más sí se limpian', () => {
    expect(planUnificacionLocalidades([{ id: '1', nombre: 'Banda del Río Salí' }], ['Banda del Río Salí', 'Tafí Viejo']).grupos).toEqual([]);
    const sucio = planUnificacionLocalidades([], ['Tafí Viejo ', 'Tafí Viejo']);
    expect(sucio.grupos[0].destino).toBe('Tafí Viejo');
    expect(sucio.grupos[0].clientes.map((c) => c.desde)).toEqual(['Tafí Viejo ']);
  });
});
