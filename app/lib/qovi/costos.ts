// ============================================================
// Cálculo de costo estimado de una llamada a Claude — pura, sin tocar red.
// Precios configurables en config.ts (QOVI_PRECIOS_USD_POR_MILLON), nunca
// repetidos acá.
// ============================================================
import { QOVI_PRECIOS_USD_POR_MILLON, QOVI_PRECIO_USD_POR_MILLON_DEFAULT } from './config';

export function costoEstimadoUsd(modelo: string, tokensEntrada: number, tokensSalida: number, tokensCache = 0): number {
  const precio = QOVI_PRECIOS_USD_POR_MILLON[modelo] ?? QOVI_PRECIO_USD_POR_MILLON_DEFAULT;
  const costo =
    (tokensEntrada / 1_000_000) * precio.entrada +
    (tokensSalida / 1_000_000) * precio.salida +
    (tokensCache / 1_000_000) * precio.cache;
  // 6 decimales: con Haiku, una consulta normal cuesta fracciones de centavo —
  // redondear a menos decimales mostraría $0.00 para casi todo.
  return Math.round(costo * 1_000_000) / 1_000_000;
}
