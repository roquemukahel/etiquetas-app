// Manifiesto único de las ilustraciones de Qovi. Nadie escribe la ruta a
// mano en un componente — todos importan de acá, así hay un solo lugar
// para saber qué imágenes existen y qué significa cada una.
//
// Cada ilustración tiene una función semántica concreta y una condición
// real que la habilita (ver componente QoviState y sus usos). No agregar
// una escena nueva a este manifiesto sin que corresponda a un estado real
// de la aplicación — Qovi no es decoración.
export const QOVI_ASSETS = {
  // Sección/categoría realmente vacía (cero productos/dispositivos), no
  // una búsqueda sin resultados.
  stockVacio: '/qovi/stock-vacio.png',
  // Hay reparaciones demoradas de verdad (ver esDemorado() en
  // app/lib/reparaciones.ts) — nunca decorativo, nunca en cada reparación.
  reparacionDemorada: '/qovi/reparacion-demorada.png',
  // Una comparación real ya calculada por el sistema dio positiva (más
  // ventas/ingresos que el período anterior). Nunca con datos inventados.
  estadisticasPositivas: '/qovi/estadisticas-positivas.png',
  // Hay una búsqueda o filtro activo y dio cero coincidencias — distinto
  // de una sección vacía (ver stockVacio).
  sinResultados: '/qovi/sin-resultados.png',
} as const;

export type QoviEscena = keyof typeof QOVI_ASSETS;
