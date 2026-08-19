import { describe, it, expect } from 'vitest';
import { rangoDe } from './datos';

// "Ahora" fijo para que los tests sean deterministas: miércoles 19 de
// agosto de 2026, 15:00.
const AHORA = new Date(2026, 7, 19, 15, 0, 0, 0);

describe('rangoDe — período actual (sin fechaReferencia, igual que antes)', () => {
  it('hoy: arranca a medianoche y termina en "ahora" (parcial)', () => {
    const r = rangoDe('hoy', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 7, 19, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('semana: arranca el lunes de esta semana y termina en "ahora"', () => {
    const r = rangoDe('semana', AHORA);
    // 19/8/2026 es miércoles → el lunes es 17/8/2026.
    expect(r.inicio).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('mes: arranca el 1° del mes y termina en "ahora"', () => {
    const r = rangoDe('mes', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });

  it('año: arranca el 1° de enero y termina en "ahora"', () => {
    const r = rangoDe('anio', AHORA);
    expect(r.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(AHORA);
  });
});

describe('rangoDe — período pasado cerrado (fechaReferencia distinta de ahora)', () => {
  it('hoy de ayer: día completo (00:00 a 23:59:59.999), no cortado', () => {
    const ayer = new Date(2026, 7, 18, 10, 0, 0, 0);
    const r = rangoDe('hoy', AHORA, ayer);
    expect(r.inicio).toEqual(new Date(2026, 7, 18, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2026, 7, 18, 23, 59, 59, 999));
    // La comparación también es día completo contra día completo.
    expect(r.inicioPrev).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 7, 17, 23, 59, 59, 999));
  });

  it('semana pasada: lunes a domingo completo, no hasta "ahora"', () => {
    // Cualquier día de la semana pasada debería dar el mismo resultado.
    const miercolesPasado = new Date(2026, 7, 12, 9, 0, 0, 0);
    const r = rangoDe('semana', AHORA, miercolesPasado);
    expect(r.inicio).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0)); // lunes 10/8
    expect(r.fin).toEqual(new Date(2026, 7, 16, 23, 59, 59, 999)); // domingo 16/8
    expect(r.inicioPrev).toEqual(new Date(2026, 7, 3, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('mes pasado: 1° al último día del mes completo', () => {
    const julio = new Date(2026, 6, 15, 9, 0, 0, 0);
    const r = rangoDe('mes', AHORA, julio);
    expect(r.inicio).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(r.inicioPrev).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });

  it('año pasado: 1° de enero a 31 de diciembre completo', () => {
    const añoPasado = new Date(2025, 5, 1, 9, 0, 0, 0);
    const r = rangoDe('anio', AHORA, añoPasado);
    expect(r.inicio).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    expect(r.inicioPrev).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
    expect(r.finPrev).toEqual(new Date(2024, 11, 31, 23, 59, 59, 999));
  });

  it('semana que resulta ser la actual usa el comportamiento parcial, no el cerrado', () => {
    // fechaReferencia cae en la MISMA semana que "ahora" → debe comportarse
    // como el período actual (fin = ahora), no como semana cerrada.
    const lunesDeEstaSemana = new Date(2026, 7, 17, 8, 0, 0, 0);
    const r = rangoDe('semana', AHORA, lunesDeEstaSemana);
    expect(r.fin).toEqual(AHORA);
  });
});
