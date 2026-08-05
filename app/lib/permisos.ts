import { Actor } from './actor';

export type Permiso =
  | 'vender'
  | 'eliminar'
  | 'agregar_stock'
  | 'ver_estadisticas'
  | 'recibir_servicio_tecnico'
  | 'gestionar_servicio_tecnico';

// Sin actor elegido todavía, o un actor sin datos de permisos (guardado
// antes de que existiera esto): no restringimos — mantiene el
// comportamiento de siempre hasta que el dueño configure algo
// explícitamente. Vendedores y técnicos comparten las mismas columnas de
// permisos (ver app/lib/actor.ts), así que acá no importa el tipo.
//
// El "?? true" en cada campo es a propósito: el actor elegido puede venir
// de un localStorage viejo, guardado antes de que existiera algún permiso
// nuevo (pasó al agregar los dos de Servicio Técnico). Sin ese fallback,
// alguien que el dueño ya había restringido con el sistema anterior
// quedaría bloqueado de golpe en el permiso nuevo hasta volver a elegirse
// en "Cambiar" — el default siempre tiene que ser "permitido", nunca
// "denegado por dato faltante".
export function tienePermiso(actor: Actor | null, permiso: Permiso): boolean {
  if (!actor || !actor.permisos) return true;
  if (actor.permisos.accesoCompleto) return true;
  switch (permiso) {
    case 'vender':
      return actor.permisos.puedeVender ?? true;
    case 'eliminar':
      return actor.permisos.puedeEliminar ?? true;
    case 'agregar_stock':
      return actor.permisos.puedeAgregarStock ?? true;
    case 'ver_estadisticas':
      return actor.permisos.puedeVerEstadisticas ?? true;
    case 'recibir_servicio_tecnico':
      return actor.permisos.puedeRecibirServicioTecnico ?? true;
    case 'gestionar_servicio_tecnico':
      return actor.permisos.puedeGestionarServicioTecnico ?? true;
  }
}
