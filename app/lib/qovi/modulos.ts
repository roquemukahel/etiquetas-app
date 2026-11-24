// ============================================================
// Qué módulo real de Qovento corresponde a cada ruta — usado para saludar
// según la pantalla actual, sugerir preguntas relevantes y para que la
// búsqueda en la base de conocimiento le dé prioridad a esos artículos.
// Misma lista de módulos que usan los artículos (qovi_articulos.modulo).
// ============================================================
export type ModuloQovi =
  | 'ventas'
  | 'stock'
  | 'clientes'
  | 'servicio_tecnico'
  | 'plan_canje'
  | 'compras'
  | 'proveedores'
  | 'estadisticas'
  | 'comisiones'
  | 'caja'
  | 'configuracion'
  | 'cuentas_por_cobrar'
  | 'plan_ahorro'
  | 'general';

export const ETIQUETA_MODULO: Record<ModuloQovi, string> = {
  ventas: 'Órdenes',
  stock: 'Stock',
  clientes: 'Clientes',
  servicio_tecnico: 'Servicio Técnico',
  plan_canje: 'Plan Canje',
  compras: 'Compras',
  proveedores: 'Proveedores',
  estadisticas: 'Estadísticas',
  comisiones: 'Comisiones',
  caja: 'Caja',
  configuracion: 'Configuración',
  cuentas_por_cobrar: 'Cuentas por cobrar',
  plan_ahorro: 'Plan de ahorro',
  general: 'Qovento',
};

// Ordenado de más a menos específico — una ruta como "/ordenes/nueva" tiene
// que matchear antes que un prefijo más corto si lo hubiera.
const RUTA_A_MODULO: [string, ModuloQovi][] = [
  ['/ordenes', 'ventas'],
  ['/caja', 'caja'],
  ['/stock', 'stock'],
  ['/servicio-tecnico', 'servicio_tecnico'],
  ['/canje', 'plan_canje'],
  ['/compras', 'compras'],
  ['/proveedores', 'proveedores'],
  ['/estadisticas', 'estadisticas'],
  ['/comisiones', 'comisiones'],
  ['/cuentas-por-cobrar', 'cuentas_por_cobrar'],
  ['/plan-ahorro', 'plan_ahorro'],
  ['/clientes', 'clientes'],
  ['/configuracion', 'configuracion'],
];

export function moduloDeRuta(pathname: string | null | undefined): ModuloQovi {
  if (!pathname) return 'general';
  const match = RUTA_A_MODULO.find(([prefijo]) => pathname.startsWith(prefijo));
  return match ? match[1] : 'general';
}

// Lista cerrada — si el cliente manda cualquier otra cosa, se ignora (cae a 'general').
export function esModuloValido(valor: unknown): valor is ModuloQovi {
  return typeof valor === 'string' && valor in ETIQUETA_MODULO;
}

// Preguntas sugeridas por módulo — curadas a mano a partir de los artículos
// reales (nunca generadas por el modelo), 3 a 4 por pantalla.
export const PREGUNTAS_SUGERIDAS_POR_MODULO: Record<ModuloQovi, string[]> = {
  ventas: ['¿Cómo hago una venta?', '¿Cómo cargo un cliente nuevo al vender?', '¿Cómo imprimo la boleta?'],
  stock: ['¿Cómo cargo un dispositivo nuevo?', '¿Cómo cargo con foto?', '¿Cómo busco un equipo por IMEI?'],
  clientes: ['¿Cómo registro un cliente?', '¿Cómo busco a un cliente?'],
  servicio_tecnico: ['¿Cómo recibo un equipo a reparar?', '¿Cómo cargo el repuesto que usé?', '¿Cómo marco una reparación como lista?'],
  plan_canje: ['¿Cómo recibo un equipo como parte de pago?', '¿Cómo pasa un canje al Stock?'],
  compras: ['¿Cómo cargo una compra?', '¿Cómo mando una compra al Stock?'],
  proveedores: ['¿Cómo registro una deuda con un proveedor?'],
  estadisticas: ['¿Dónde veo mis estadísticas?', '¿Por qué no veo la ganancia?'],
  comisiones: ['¿Cómo configuro las comisiones?', '¿Cómo agrego una regla por categoría?'],
  caja: ['¿Cómo cierro la caja?', '¿Cómo registro un ingreso de capital?'],
  configuracion: ['¿Cómo modifico los datos de mi negocio?', '¿Cómo configuro las comisiones?'],
  cuentas_por_cobrar: ['¿Dónde veo lo que me deben los clientes?'],
  plan_ahorro: ['¿Cómo cargo un plan de ahorro?'],
  general: ['¿Cómo hago una venta?', '¿Cómo genero una orden de reparación?', '¿Cómo ingreso un dispositivo al stock?', '¿Cómo registro un cliente?'],
};

export function mensajeInicial(modulo: ModuloQovi): string {
  if (modulo === 'general') {
    return '¡Hola! Soy Qovi, el asistente de Qovento. Puedo ayudarte a realizar una venta, cargar un equipo, generar una orden de reparación o entender cualquier función del sistema. ¿Qué necesitás hacer?';
  }
  return `Veo que estás en ${ETIQUETA_MODULO[modulo]}. ¿En qué te puedo ayudar acá?`;
}
