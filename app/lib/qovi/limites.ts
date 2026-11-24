// ============================================================
// Decisión pura de rate limiting — el conteo real (cuántas consultas hizo
// este negocio hoy/en el último minuto) lo trae servicio.ts desde
// qovi_uso; acá solo se decide si con esos números se puede seguir.
// ============================================================
import { QOVI_RATE_LIMIT, QOVI_DAILY_TENANT_LIMIT } from './config';

export function superaLimitePorMinuto(consultasUltimoMinuto: number): boolean {
  return consultasUltimoMinuto >= QOVI_RATE_LIMIT;
}

export function superaLimiteDiario(consultasHoy: number, limiteDiarioNegocio: number | null): boolean {
  const limite = limiteDiarioNegocio ?? QOVI_DAILY_TENANT_LIMIT;
  return consultasHoy >= limite;
}
