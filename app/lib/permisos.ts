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
export function tienePermiso(actor: Actor | null, permiso: Permiso): boolean {
  if (!actor || !actor.permisos) return true;
  if (actor.permisos.accesoCompleto) return true;
  switch (permiso) {
    case 'vender':
      return actor.permisos.puedeVender;
    case 'eliminar':
      return actor.permisos.puedeEliminar;
    case 'agregar_stock':
      return actor.permisos.puedeAgregarStock;
    case 'ver_estadisticas':
      return actor.permisos.puedeVerEstadisticas;
    case 'recibir_servicio_tecnico':
      return actor.permisos.puedeRecibirServicioTecnico;
    case 'gestionar_servicio_tecnico':
      return actor.permisos.puedeGestionarServicioTecnico;
  }
}
