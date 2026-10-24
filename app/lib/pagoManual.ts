// Datos del pago manual por USDT — alternativa a Lemon Squeezy mientras
// la verificación de identidad sigue en trámite, y para evitar la
// comisión del intermediario.
export const USDT_RED = 'BEP20 (BNB Smart Chain)';
export const USDT_DIRECCION = '0xf33f7083b341e65217600e39f51cbe7c7e72b58a';

// ID de Binance Pay para cobrar USDT sin comisión de red (se paga de una cuenta de Binance a otra, sin elegir red).
// Mientras esté vacío NO se muestra esta opción. Se completa con el ID de Binance Pay del titular de la cuenta.
export const BINANCE_PAY_ID = '';

// Más barato que pagar con tarjeta (Lemon Squeezy cobra comisión) para
// incentivar el pago por USDT.
export const PRECIO_USDT_MENSUAL = 12;
export const PRECIO_USDT_ANUAL = 120;

// Pago con tarjeta (Lemon Squeezy): estos valores son solo el TEXTO que se muestra; el cobro real lo define el producto/variante
// configurado en Lemon Squeezy (hay que cambiarlo también ahí). Mantiene la diferencia de siempre contra USDT (+25%).
export const PRECIO_TARJETA_MENSUAL = 15;
export const PRECIO_TARJETA_ANUAL = 150;

// Pagos con tarjeta (Lemon Squeezy) deshabilitados temporalmente mientras la
// verificación de identidad de la cuenta de pagos sigue en trámite. Volver a
// poner en `true` cuando Lemon Squeezy la apruebe.
export const PAGOS_CON_TARJETA_DISPONIBLES = false;

// Transferencia bancaria en pesos (Argentina) — mismo espíritu que el pago
// por USDT: otra alternativa mientras se termina de habilitar el pago con
// tarjeta, para montos chicos al arrancar. Precio fijo en pesos, no atado
// al dólar del día — si el tipo de cambio se mueve mucho, se actualiza a
// mano acá (tomado con dólar ~$1550 al cargarlo).
// CVU y alias de la cuenta de Qovento (titular: Mukahel Ahmad Roque). Si el CVU queda vacío NO se muestra (solo el alias); si cambia de
// cuenta hay que cambiar los tres datos juntos: nunca dejar un CVU de otro titular.
export const TRANSFERENCIA_CVU = '0000177508836005694122';
export const TRANSFERENCIA_ALIAS = 'Qovento';
export const TRANSFERENCIA_TITULAR = 'Mukahel Ahmad Roque';
export const PRECIO_ARS_MENSUAL = 17500;
export const PRECIO_ARS_ANUAL = 175000;
