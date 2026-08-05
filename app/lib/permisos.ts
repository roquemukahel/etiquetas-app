import { Actor } from './actor';

export type Permiso = 'vender' | 'eliminar' | 'agregar_stock';

// Sin actor elegido todavía, o técnico (los permisos son solo de
// vendedores), o un vendedor sin datos de permisos (actor guardado antes
// de que existiera esto): no restringimos — mantiene el comportamiento de
// siempre hasta que el dueño configure algo explícitamente.
export function tienePermiso(actor: Actor | null, permiso: Permiso): boolean {
  if (!actor || actor.tipo === 'tecnico' || !actor.permisos) return true;
  if (actor.permisos.accesoCompleto) return true;
  if (permiso === 'vender') return actor.permisos.puedeVender;
  if (permiso === 'eliminar') return actor.permisos.puedeEliminar;
  return actor.permisos.puedeAgregarStock;
}
