// Errores de Supabase Auth que NO significan "no hay sesión": una caída de red, un timeout o un 5xx del servicio de autenticación.
// El middleware, ante uno de esos, no debe mandar a nadie a /login (la sesión sigue siendo válida; fue el pedido el que falló).
// Sí cuentan como "sin sesión" la falta de cookie (AuthSessionMissingError) y los 4xx de un token inválido, vencido o revocado.
export function esErrorTransitorioDeAuth(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  const s = error.status;
  if (typeof s !== 'number') return false;
  return s === 0 || s === 429 || s >= 500;
}
