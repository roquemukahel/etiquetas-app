import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { costoDeCanjeDeOrigen, idsDeCanjesDerivados, marcarCanjeDeOrigenAgregado } from './canje';

// Un "supabase" mínimo que anota lo que se le pide y devuelve lo que se le indica.
function falso(respuestas: { canjeOrigenId?: string | null; errorLectura?: boolean; derivados?: string[] }) {
  const updates: { tabla: string; valores: Record<string, unknown>; filtros: [string, unknown][] }[] = [];
  const cliente = {
    from(tabla: string) {
      const filtros: [string, unknown][] = [];
      let valores: Record<string, unknown> | null = null;
      const q: any = {
        select: () => q,
        update: (v: Record<string, unknown>) => {
          valores = v;
          return q;
        },
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          if (valores) updates.push({ tabla, valores, filtros: [...filtros] });
          return q;
        },
        not: () => q,
        range: () => q,
        order: () => q,
        maybeSingle: async () =>
          respuestas.errorLectura ? { data: null, error: { message: 'x' } } : { data: respuestas.canjeOrigenId === undefined ? null : { canje_origen_id: respuestas.canjeOrigenId }, error: null },
        then: (ok: (r: unknown) => unknown) =>
          Promise.resolve({ data: (respuestas.derivados ?? []).map((id) => ({ canje_origen_id: id })), error: null, count: (respuestas.derivados ?? []).length }).then(ok),
      };
      return q;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, updates };
}

describe('canje de origen de una reparación', () => {
  it('al pasar al Stock un equipo que vino de Plan Canje, su canje queda como agregado', async () => {
    const { cliente, updates } = falso({ canjeOrigenId: 'canje-1' });
    await marcarCanjeDeOrigenAgregado(cliente, 'rep-1');
    const ultimo = updates[updates.length - 1];
    expect(ultimo).toMatchObject({ tabla: 'canjes', valores: { agregado_a_stock: true } });
    expect(ultimo.filtros).toEqual([
      ['id', 'canje-1'],
      ['agregado_a_stock', false],
    ]);
  });
  it('si la reparación no vino de un canje no toca nada', async () => {
    const { cliente, updates } = falso({ canjeOrigenId: null });
    await marcarCanjeDeOrigenAgregado(cliente, 'rep-1');
    expect(updates).toHaveLength(0);
  });
  it('si no se puede leer la reparación no toca nada ni falla', async () => {
    const { cliente, updates } = falso({ errorLectura: true });
    await expect(marcarCanjeDeOrigenAgregado(cliente, 'rep-1')).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });
  it('los canjes derivados se reconocen por la reparación que apunta a ellos', async () => {
    const { cliente } = falso({ derivados: ['canje-1', 'canje-2'] });
    const ids = await idsDeCanjesDerivados(cliente);
    expect([...ids].sort()).toEqual(['canje-1', 'canje-2']);
  });
});

// Un "supabase" que responde distinto según la tabla: reparaciones -> canje de origen, canjes -> monto.
function falsoConMonto(canjeOrigenId: string | null, monto: number | string | null) {
  return {
    from(tabla: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: tabla === 'reparaciones' ? { canje_origen_id: canjeOrigenId } : { monto },
          error: null,
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe('costo que se recupera del canje de origen', () => {
  it('lo reconocido al cliente por el equipo pasa a ser su costo en el Stock', async () => {
    expect(await costoDeCanjeDeOrigen(falsoConMonto('canje-1', 100), 'rep-1')).toBe(100);
    expect(await costoDeCanjeDeOrigen(falsoConMonto('canje-1', '250.5'), 'rep-1')).toBe(250.5);
  });
  it('sin canje de origen, o con monto vacío o cero, no inventa un costo', async () => {
    expect(await costoDeCanjeDeOrigen(falsoConMonto(null, 100), 'rep-1')).toBeNull();
    expect(await costoDeCanjeDeOrigen(falsoConMonto('canje-1', null), 'rep-1')).toBeNull();
    expect(await costoDeCanjeDeOrigen(falsoConMonto('canje-1', 0), 'rep-1')).toBeNull();
  });
});
