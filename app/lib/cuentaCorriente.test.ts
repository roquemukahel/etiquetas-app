import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diasDeMora, vencimientoDesdeHoy } from './cuentaCorriente';
import { ordenYaTieneCargoCuentaCorriente } from './ordenesServicio';

describe('fechas de cuenta corriente (calendario local, no UTC)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el vencimiento a 30 días de una venta nocturna no se corre un día', () => {
    // 22:30 locales: en Argentina (UTC-3) ya es el día siguiente en UTC.
    vi.setSystemTime(new Date(2026, 9, 2, 22, 30));
    expect(vencimientoDesdeHoy(30)).toBe('2026-11-01');
  });

  it('sin plazo no hay vencimiento', () => {
    expect(vencimientoDesdeHoy(null)).toBeNull();
    expect(vencimientoDesdeHoy(0)).toBeNull();
  });

  it('los días de mora cuentan días calendario locales', () => {
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0));
    expect(diasDeMora('2026-10-01')).toBe(1);
    expect(diasDeMora('2026-09-22')).toBe(10);
  });

  it('un vencimiento de hoy o futuro no es mora', () => {
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0));
    expect(diasDeMora('2026-10-02')).toBeNull();
    expect(diasDeMora('2026-10-15')).toBeNull();
    expect(diasDeMora(null)).toBeNull();
  });
});

// Cada tabla responde lo que se le indique; cualquier encadenado de filtros
// (.select().eq()...) devuelve el mismo objeto "esperable".
function supabaseFalso(respuestas: Record<string, { count: number | null; error: unknown }>) {
  return {
    from: (tabla: string) => {
      const consulta: any = new Proxy(
        {},
        {
          get: (_t, prop) => (prop === 'then' ? (resolver: (v: unknown) => void) => resolver(respuestas[tabla]) : () => consulta),
        }
      );
      return consulta;
    },
  };
}

describe('ordenYaTieneCargoCuentaCorriente', () => {
  it('true si ya hay un cargo a cuenta corriente', async () => {
    const sb = supabaseFalso({ cta_cte_movimientos: { count: 1, error: null }, financiacion_planes: { count: 0, error: null } });
    expect(await ordenYaTieneCargoCuentaCorriente(sb, 'o1')).toBe(true);
  });

  it('true si ya hay un plan de financiación', async () => {
    const sb = supabaseFalso({ cta_cte_movimientos: { count: 0, error: null }, financiacion_planes: { count: 1, error: null } });
    expect(await ordenYaTieneCargoCuentaCorriente(sb, 'o1')).toBe(true);
  });

  it('false si no hay ninguno', async () => {
    const sb = supabaseFalso({ cta_cte_movimientos: { count: 0, error: null }, financiacion_planes: { count: 0, error: null } });
    expect(await ordenYaTieneCargoCuentaCorriente(sb, 'o1')).toBe(false);
  });

  it('null (no asumir "no") si alguna consulta falla', async () => {
    const sb = supabaseFalso({ cta_cte_movimientos: { count: null, error: { message: 'boom' } }, financiacion_planes: { count: 0, error: null } });
    expect(await ordenYaTieneCargoCuentaCorriente(sb, 'o1')).toBeNull();
  });
});
