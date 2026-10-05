// Supabase NO lanza excepción cuando una escritura falla (permisos, una
// restricción de la base, un corte de red): devuelve `{ error }` y listo. Si el
// código ignora ese `error`, la pantalla muestra "guardado" / "eliminado" y
// escribe la auditoría de algo que en realidad nunca pasó — de ahí salen los
// reclamos del tipo "lo borré y sigue ahí" o "quedó guardado distinto".
//
// Uso (devuelve true si FALLÓ, y ya le avisó a quien está usando la pantalla):
//   if (await falla(supabase.from('x').delete().eq('id', id), t)) return;
//
// Para escrituras "de cortesía" que no deben frenar el flujo (un mensaje que
// no se pudo registrar, un rollback) usar `registrarFallo`, que solo deja
// rastro en la consola y en Sentry sin interrumpir al usuario.
type ErrorSupabase = { message: string; code?: string } | null;
type Resultado = { error: ErrorSupabase };

// 23503 = violación de clave foránea (el registro lo usa otra tabla).
const CODIGO_EN_USO = '23503';

export function mensajeDeFalla(error: NonNullable<ErrorSupabase>, t: (s: string) => string): string {
  if (error.code === CODIGO_EN_USO) {
    return t('Está en uso en otros registros, así que no se puede eliminar.');
  }
  return error.message;
}

export async function falla(consulta: PromiseLike<Resultado>, t: (s: string) => string, contexto?: string): Promise<boolean> {
  let resultado: Resultado;
  try {
    resultado = await consulta;
  } catch (err) {
    resultado = { error: { message: err instanceof Error ? err.message : String(err) } };
  }
  if (!resultado.error) return false;
  registrarFallo(resultado.error, contexto);
  alert(`${t('No se pudo guardar el cambio. No se modificó nada.')}\n${mensajeDeFalla(resultado.error, t)}`);
  return true;
}

export function registrarFallo(error: unknown, contexto?: string) {
  console.error(`[escritura fallida]${contexto ? ' ' + contexto : ''}`, error);
  // Import dinámico: Sentry se descarga recién cuando hay una falla que reportar,
  // no suma peso al arranque de ninguna pantalla.
  import('@sentry/nextjs')
    .then((Sentry) =>
      Sentry.captureMessage(`Escritura fallida${contexto ? ': ' + contexto : ''}`, {
        level: 'warning',
        extra: { error: error as Record<string, unknown> },
      })
    )
    .catch(() => {});
}
