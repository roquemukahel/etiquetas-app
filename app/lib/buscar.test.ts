import { describe, expect, it } from 'vitest';
import { buscarPorTexto } from './buscar';

type Equipo = { modelo: string; color: string | null; imei: string | null; detalle: string | null };
const equipos: Equipo[] = [
  { modelo: 'iPhone 13 Pro', color: 'Plata', imei: '351803610890297', detalle: 'Falla en módulo y cámara' },
  { modelo: 'iPhone 13', color: 'Azul', imei: '358265583034951', detalle: 'Batería hinchada' },
  { modelo: 'iPhone 14', color: 'Medianoche', imei: null, detalle: null },
];
const campos = (e: Equipo) => [e.modelo, e.color, e.imei, e.detalle];

describe('buscador de listas', () => {
  it('sin texto devuelve todo', () => {
    expect(buscarPorTexto(equipos, '   ', campos)).toHaveLength(3);
  });
  it('cada palabra tiene que aparecer, en cualquier orden', () => {
    expect(buscarPorTexto(equipos, 'azul 13', campos).map((e) => e.modelo)).toEqual(['iPhone 13']);
  });
  it('no distingue mayúsculas ni acentos', () => {
    expect(buscarPorTexto(equipos, 'MODULO camara', campos)).toHaveLength(1);
  });
  it('encuentra un IMEI por sus últimos dígitos o por un tramo del medio', () => {
    expect(buscarPorTexto(equipos, '0297', campos).map((e) => e.modelo)).toEqual(['iPhone 13 Pro']); // últimos 4
    expect(buscarPorTexto(equipos, '8036', campos).map((e) => e.modelo)).toEqual(['iPhone 13 Pro']); // del medio
    expect(buscarPorTexto(equipos, '3034951', campos).map((e) => e.modelo)).toEqual(['iPhone 13']);
  });
  it('un equipo sin IMEI ni detalle no rompe la búsqueda', () => {
    expect(buscarPorTexto(equipos, 'medianoche', campos)).toHaveLength(1);
  });
  it('sin coincidencias devuelve vacío', () => {
    expect(buscarPorTexto(equipos, 'samsung', campos)).toEqual([]);
  });
});
