// Datos del pago manual por USDT — alternativa a Lemon Squeezy mientras
// la verificación de identidad sigue en trámite, y para evitar la
// comisión del intermediario.
export const USDT_RED = 'BEP20 (BNB Smart Chain)';
export const USDT_DIRECCION = '0xf33f7083b341e65217600e39f51cbe7c7e72b58a';

// Más barato que pagar con tarjeta (Lemon Squeezy cobra comisión) para
// incentivar el pago por USDT.
export const PRECIO_USDT_MENSUAL = 9.99;
export const PRECIO_USDT_ANUAL = 100;

// Pagos con tarjeta (Lemon Squeezy) deshabilitados temporalmente mientras la
// verificación de identidad de la cuenta de pagos sigue en trámite. Volver a
// poner en `true` cuando Lemon Squeezy la apruebe.
export const PAGOS_CON_TARJETA_DISPONIBLES = false;

// Transferencia bancaria en pesos (Argentina) — mismo espíritu que el pago
// por USDT: otra alternativa mientras se termina de habilitar el pago con
// tarjeta, para montos chicos al arrancar. Precio fijo en pesos, no atado
// al dólar del día — si el tipo de cambio se mueve mucho, se actualiza a
// mano acá (tomado con dólar ~$1550 al cargarlo).
export const TRANSFERENCIA_CVU = '0000177508300006433407';
export const TRANSFERENCIA_ALIAS = 'TEATRO.HOYO.DESTINAR';
export const TRANSFERENCIA_TITULAR = 'Matias Andres Borda';
export const PRECIO_ARS_MENSUAL = 15500;
export const PRECIO_ARS_ANUAL = 155000;
