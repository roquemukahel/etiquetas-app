import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bateriaDeReparacion, campoBateriaServicio } from './bateriaServicio';

// Un "supabase" mínimo: la columna existe (la prueba de migración responde bien) y la lectura devuelve lo indicado.
function falso(lectura: { salud_bateria?: number | null; error?: boolean }) {
  const q: any = {
    select: () => q,
    eq: () => q,
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: async () => (lectura.error ? { data: null, error: { message: 'x' } } : { data: { salud_bateria: lectura.salud_bateria ?? null }, error: null }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

describe('batería que acompaña al equipo en Servicio Técnico', () => {
  it('al crear la orden suma el porcentaje solo si hay', async () => {
    expect(await campoBateriaServicio(falso({}), 87)).toEqual({ salud_bateria: 87 });
    expect(await campoBateriaServicio(falso({}), null)).toEqual({});
    expect(await campoBateriaServicio(falso({}), undefined)).toEqual({});
  });
  it('al sacar el equipo de la orden lee el porcentaje guardado', async () => {
    expect(await bateriaDeReparacion(falso({ salud_bateria: 91 }), 'rep-1')).toBe(91);
    expect(await bateriaDeReparacion(falso({ salud_bateria: null }), 'rep-1')).toBeNull();
  });
  it('si la lectura falla, el equipo entra igual, sin porcentaje', async () => {
    expect(await bateriaDeReparacion(falso({ error: true }), 'rep-1')).toBeNull();
  });
});
