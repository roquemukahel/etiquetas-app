import { Actor } from './actor';

export type Permiso =
  | 'vender'
  | 'eliminar'
  | 'agregar_stock'
  | 'ver_estadisticas'
  | 'recibir_servicio_tecnico'
  | 'gestionar_servicio_tecnico'
  // Estos tres son distintos de los de arriba: ni siquiera "acceso
  // completo" alcanza para 'auditoria'/'gestionar_usuarios', SOLO
  // esAdministrador — ver más abajo. 'ver_proveedores' es un poco menos
  // estricto: alcanza con "acceso completo" (no hace falta ser
  // administrador), pero a diferencia de los primeros seis no es un
  // permiso granular propio con su columna — no se le puede dar este
  // acceso a alguien sin acceso completo.
  | 'auditoria'
  | 'gestionar_usuarios'
  | 'ver_proveedores'
  // Comisiones: gestionar (planes, aprobar, liquidar, pagar, ajustar) queda
  // como 'ver_proveedores' — solo con acceso completo/administrador. Ver
  // comisiones lo puede cualquiera (el vendedor ve SOLO las suyas, filtrado en
  // las consultas).
  | 'gestionar_comisiones'
  | 'ver_comisiones';

// Sin actor elegido todavía, o un actor sin datos de permisos (guardado
// antes de que existiera esto): no restringimos — mantiene el
// comportamiento de siempre hasta que el dueño configure algo
// explícitamente. Vendedores y técnicos comparten las mismas columnas de
// permisos (ver app/lib/actor.ts), así que acá no importa el tipo.
//
// El "?? true" en cada campo es a propósito: el actor elegido puede venir
// de un localStorage viejo, guardado antes de que existiera algún permiso
// nuevo (pasó al agregar los dos de Servicio Técnico, y va a volver a
// pasar cada vez que se sume uno). Sin ese fallback, alguien que el dueño
// ya había restringido con el sistema anterior quedaría bloqueado de
// golpe en el permiso nuevo hasta volver a elegirse en "Cambiar" — el
// default siempre tiene que ser "permitido", nunca "denegado por dato
// faltante".
export function tienePermiso(actor: Actor | null, permiso: Permiso): boolean {
  if (!actor || !actor.permisos) return true;
  if (actor.permisos.esAdministrador ?? true) return true;
  // Auditoría y gestionar a otros usuarios quedan reservados al
  // administrador — "acceso completo" ya no alcanza para esto (antes de
  // este cambio no existía la distinción, así que un vendedor con acceso
  // completo pero sin ser administrador ahora pierde estas dos, algo que
  // no pasaba con ninguno de los otros permisos).
  if (permiso === 'auditoria' || permiso === 'gestionar_usuarios') return false;
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
    case 'ver_comisiones':
      // Cualquiera puede ver comisiones; las consultas filtran a las propias
      // del vendedor cuando no tiene acceso completo.
      return true;
    // 'gestionar_comisiones' NO está acá a propósito: cae en default → solo
    // administrador o acceso completo (que ya devolvieron true más arriba).
    default:
      return false;
  }
}
