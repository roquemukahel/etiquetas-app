// ============================================================
// Qovi nunca devuelve una URL libre generada por el modelo — solo puede
// elegir una CLAVE de esta lista cerrada, y acá se resuelve a una ruta real
// ya existente en la app. Si Claude devuelve una clave que no está acá, se
// descarta (ver respuesta.ts).
// ============================================================
export const QOVI_ACCIONES: Record<string, { etiqueta: string; href: string }> = {
  ir_ordenes_nueva: { etiqueta: 'Nueva orden', href: '/ordenes/nueva' },
  ir_ordenes: { etiqueta: 'Ver órdenes', href: '/ordenes' },
  ir_servicio_tecnico: { etiqueta: 'Servicio Técnico', href: '/servicio-tecnico' },
  ir_stock: { etiqueta: 'Ir a Stock', href: '/stock' },
  ir_clientes: { etiqueta: 'Ir a Clientes', href: '/clientes' },
  ir_estadisticas: { etiqueta: 'Ver estadísticas', href: '/estadisticas' },
  ir_configuracion_comisiones: { etiqueta: 'Configurar comisiones', href: '/configuracion/comisiones' },
  ir_comisiones_planes: { etiqueta: 'Reglas de comisión', href: '/comisiones/planes' },
  ir_configuracion_negocio: { etiqueta: 'Datos del negocio', href: '/configuracion/negocio' },
  ir_caja: { etiqueta: 'Ir a Caja', href: '/caja' },
  ir_plan_canje: { etiqueta: 'Plan Canje', href: '/canje' },
  ir_compras: { etiqueta: 'Ir a Compras', href: '/compras' },
  ir_proveedores: { etiqueta: 'Ir a Proveedores', href: '/proveedores' },
};

export type ClaveAccionQovi = keyof typeof QOVI_ACCIONES;

export function esAccionValida(clave: string): clave is ClaveAccionQovi {
  return Object.prototype.hasOwnProperty.call(QOVI_ACCIONES, clave);
}

// Filtra y resuelve una lista de claves (como las devuelve el modelo o como
// vienen guardadas en un artículo) a solo las acciones realmente válidas.
export function resolverAcciones(claves: unknown): { clave: ClaveAccionQovi; etiqueta: string; href: string }[] {
  if (!Array.isArray(claves)) return [];
  const resueltas: { clave: ClaveAccionQovi; etiqueta: string; href: string }[] = [];
  for (const c of claves) {
    if (typeof c === 'string' && esAccionValida(c)) {
      resueltas.push({ clave: c, ...QOVI_ACCIONES[c] });
    }
  }
  return resueltas;
}
