// ============================================================
// Qovi — configuración centralizada (modelo, límites, precios). Un solo
// lugar para leer variables de entorno: nada de nombres de modelo ni
// límites repetidos sueltos por otros archivos.
// ============================================================

// Apagado total de la función, sin tocar nada más del sistema (el resto de
// la app sigue compilando y funcionando igual si esto falta o es false).
export const QOVI_ENABLED = (process.env.QOVI_ENABLED ?? 'true') !== 'false';

// Familia Haiku por defecto (rápida y económica) — configurable sin tocar código.
export const QOVI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
// Modelo de respaldo para preguntas más complejas (combinan varios procedimientos)
// o cuando la confianza de la primera respuesta fue baja. Mismo criterio: un solo lugar.
export const QOVI_MODEL_ALTERNATIVO = process.env.QOVI_MODEL_ALTERNATIVO || 'claude-sonnet-5-5';

export const QOVI_MAX_OUTPUT_TOKENS = Number(process.env.QOVI_MAX_OUTPUT_TOKENS) || 600;

// Mensajes por minuto por negocio (ventana corta, contra ráfagas/spam).
export const QOVI_RATE_LIMIT = Number(process.env.QOVI_RATE_LIMIT) || 8;
// Consultas por día por negocio (tope de costo). Un negocio puede tener su propio
// override en qovi_configuracion.limite_diario; esto es el default cuando no lo tiene.
export const QOVI_DAILY_TENANT_LIMIT = Number(process.env.QOVI_DAILY_TENANT_LIMIT) || 60;

// Largo máximo de un mensaje del usuario (caracteres).
export const QOVI_MAX_LARGO_MENSAJE = 1000;

// Cuántos mensajes previos de la MISMA conversación se reenvían como contexto —
// ventana chica a propósito, no se reenvía el historial completo indefinidamente.
export const QOVI_VENTANA_HISTORIAL = 6;

// Cuántos artículos de la base de conocimiento se mandan como contexto (entre 3 y 5, pedido explícito).
export const QOVI_MAX_FRAGMENTOS = 5;
export const QOVI_MIN_FRAGMENTOS_PARA_RESPONDER = 1;

// Precios configurables (USD por millón de tokens) — así no quedan pisados en el
// código de costos.ts. Pueden ajustarse sin tocar lógica si Anthropic cambia precios.
// Fuente: precios públicos de la API de Claude al momento de implementar esto;
// revisar si Anthropic los actualiza.
export const QOVI_PRECIOS_USD_POR_MILLON: Record<string, { entrada: number; salida: number; cache: number }> = {
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5, cache: 0.1 },
  'claude-sonnet-5-5': { entrada: 3, salida: 15, cache: 0.3 },
};
// Si un modelo no está en la tabla de arriba (se cambió por env var y no se actualizó
// la tabla), se usa este precio conservador en vez de cobrar "gratis" por error.
export const QOVI_PRECIO_USD_POR_MILLON_DEFAULT = { entrada: 3, salida: 15, cache: 0.3 };

// Timeout de la llamada a Anthropic (ms) — Qovi nunca debe dejar un pedido colgado.
export const QOVI_TIMEOUT_MS = 20_000;
