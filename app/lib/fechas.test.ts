import { describe, expect, it } from 'vitest';
import { fechaISONegocio, formatearFechaYHoraCorta, inicioDelDiaNegocio, inicioDelMesNegocio } from './fechas';

// Argentina es UTC-3 todo el año (sin horario de verano).
describe('huso horario del negocio (Argentina, UTC-3)', () => {
  it('a las 22:00 locales todavía es el mismo día, aunque en UTC ya sea el siguiente', () => {
    const ventaDeNoche = new Date('2026-08-31T01:00:00Z'); // 30/08 22:00 en Argentina
    expect(fechaISONegocio(ventaDeNoche)).toBe('2026-08-30');
    expect(inicioDelDiaNegocio(ventaDeNoche).toISOString()).toBe('2026-08-30T03:00:00.000Z');
  });

  it('el mes no cambia hasta la medianoche local', () => {
    const ultimaNocheDeAgosto = new Date('2026-09-01T01:30:00Z'); // 31/08 22:30 local
    expect(inicioDelMesNegocio(ultimaNocheDeAgosto).toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(inicioDelMesNegocio(new Date('2026-09-01T03:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('mes anterior cruzando el año', () => {
    expect(inicioDelMesNegocio(new Date('2026-01-15T12:00:00Z'), 1).toISOString()).toBe('2025-12-01T03:00:00.000Z');
  });

  it('días hacia atrás por calendario', () => {
    const ref = new Date('2026-03-02T15:00:00Z');
    expect(inicioDelDiaNegocio(ref, 2).toISOString()).toBe('2026-02-28T03:00:00.000Z');
  });

  it('también funciona con zonas con horario de verano', () => {
    // Nueva York: 15/01 es UTC-5; 15/07 es UTC-4
    expect(inicioDelDiaNegocio(new Date('2026-01-15T12:00:00Z'), 0, 'America/New_York').toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(inicioDelDiaNegocio(new Date('2026-07-15T12:00:00Z'), 0, 'America/New_York').toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });
});

describe('fecha de recepción en listas', () => {
  it('muestra día y hora en el huso del negocio, no en el del navegador', () => {
    // 2026-10-25 17:32 UTC = 14:32 en Argentina
    expect(formatearFechaYHoraCorta('2026-10-25T17:32:00Z')).toBe('25/10/2026 · 14:32');
  });
  it('un equipo recibido de madrugada UTC sigue siendo del día anterior en Argentina', () => {
    expect(formatearFechaYHoraCorta('2026-10-26T01:15:00Z')).toBe('25/10/2026 · 22:15');
  });
  it('sin fecha o con fecha inválida no muestra nada', () => {
    expect(formatearFechaYHoraCorta(null)).toBe('');
    expect(formatearFechaYHoraCorta('no es una fecha')).toBe('');
  });
});
