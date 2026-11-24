// ============================================================
// Qué rol le mandamos a Qovi para filtrar la base de conocimiento. Mismo
// nivel de confianza que el resto de la app: el actor (vendedor/técnico)
// es client-side (ver app/lib/actor.ts, elegido por PIN, no es un login
// separado) — el servidor confía en lo que manda el cliente, igual que
// tienePermiso() confía en actor.permisos en el resto del sistema. No es
// una capa de seguridad nueva ni más débil que la que ya existe.
// ============================================================
export type RolQovi = 'administrador' | 'vendedor' | 'tecnico';

export const ROLES_QOVI: RolQovi[] = ['administrador', 'vendedor', 'tecnico'];

export function esRolValido(valor: unknown): valor is RolQovi {
  return typeof valor === 'string' && (ROLES_QOVI as string[]).includes(valor);
}

// Un artículo sin roles_autorizados (array vacío) es visible para cualquiera.
export function rolAutorizado(rolesAutorizados: string[] | null | undefined, rol: RolQovi): boolean {
  if (!rolesAutorizados || rolesAutorizados.length === 0) return true;
  return rolesAutorizados.includes(rol);
}

// Deriva el rol que se le manda a Qovi a partir del actor elegido (PIN) en
// este navegador — mismo criterio que tienePermiso() en permisos.ts.
export function rolDeActor(actor: { tipo?: 'vendedor' | 'tecnico'; permisos?: { esAdministrador?: boolean } | null } | null): RolQovi {
  if (!actor) return 'vendedor';
  if (actor.permisos?.esAdministrador) return 'administrador';
  return actor.tipo === 'tecnico' ? 'tecnico' : 'vendedor';
}
