import { describe, expect, it } from 'vitest';
import { resolverUsuario, obtenerConfiguracion } from './servicio';

// Cliente de Supabase mínimo simulado — alcanza para probar la lógica de
// resolverUsuario/obtenerConfiguracion sin tocar red real. No reemplaza una
// prueba de integración contra Supabase real, pero sí verifica el
// comportamiento documentado: sin usuario autenticado no hay negocio, y sin
// fila de configuración Qovi queda apagado (fail closed), nunca prendido por default.
function supabaseFalso(opts: { usuario: { id: string } | null; perfil?: { negocio_id: string } | null; configuracion?: { habilitado: boolean; limite_diario: number | null } | null; errorConfiguracion?: boolean }) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.usuario } }),
    },
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (tabla === 'perfiles') return { data: opts.perfil ?? null, error: null };
            if (tabla === 'qovi_configuracion') {
              if (opts.errorConfiguracion) return { data: null, error: { message: 'boom' } };
              return { data: opts.configuracion ?? null, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  } as any;
}

describe('resolverUsuario: sin usuario autenticado no hay negocio', () => {
  it('devuelve null si no hay sesión', async () => {
    const supabase = supabaseFalso({ usuario: null });
    expect(await resolverUsuario(supabase)).toBeNull();
  });

  it('devuelve null si el usuario no tiene perfil (no debería pasar, pero no debe inventar un negocio)', async () => {
    const supabase = supabaseFalso({ usuario: { id: 'u1' }, perfil: null });
    expect(await resolverUsuario(supabase)).toBeNull();
  });

  it('resuelve el negocio real del usuario autenticado — aislamiento: cada usuario trae SU propio negocio_id, nunca uno ajeno', async () => {
    const supabase = supabaseFalso({ usuario: { id: 'u1' }, perfil: { negocio_id: 'negocio-A' } });
    expect(await resolverUsuario(supabase)).toEqual({ negocioId: 'negocio-A', usuarioId: 'u1' });
  });
});

describe('obtenerConfiguracion: Qovi apagado por default (opt-in, rollout controlado)', () => {
  it('sin fila de configuración, queda deshabilitado (no true por error)', async () => {
    const supabase = supabaseFalso({ usuario: null, configuracion: null });
    expect(await obtenerConfiguracion(supabase, 'negocio-A')).toEqual({ habilitado: false, limiteDiario: null });
  });

  it('si falla la lectura, también queda deshabilitado (fail closed)', async () => {
    const supabase = supabaseFalso({ usuario: null, errorConfiguracion: true });
    expect(await obtenerConfiguracion(supabase, 'negocio-A')).toEqual({ habilitado: false, limiteDiario: null });
  });

  it('respeta la fila real cuando el superadmin lo habilitó para ese negocio', async () => {
    const supabase = supabaseFalso({ usuario: null, configuracion: { habilitado: true, limite_diario: 25 } });
    expect(await obtenerConfiguracion(supabase, 'negocio-A')).toEqual({ habilitado: true, limiteDiario: 25 });
  });
});
