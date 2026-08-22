// Lógica compartida de cuenta corriente y medios de pago.
//
// Regla de oro (ver el documento de diseño): el saldo de un cliente NUNCA
// se guarda como un campo. Se calcula siempre como Σ(cargos) − Σ(abonos)
// sobre cta_cte_movimientos. Un saldo positivo = el cliente te debe; cero
// = al día; negativo = tiene saldo a favor (seña / pago de más).

export type MedioPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'cheque' | 'usdt';

// Los medios que SÍ son plata que entra a la caja. La "cuenta corriente"
// no está acá a propósito: no es plata que entra, es deuda que nace.
export const MEDIOS_PAGO: { codigo: MedioPago; label: string; icono: string }[] = [
  { codigo: 'efectivo', label: 'Efectivo', icono: '💵' },
  { codigo: 'transferencia', label: 'Transferencia', icono: '🏦' },
  { codigo: 'debito', label: 'Débito', icono: '💳' },
  { codigo: 'credito', label: 'Crédito', icono: '💳' },
];

// Valor especial usado en la pantalla de cobro para representar "esto queda
// como deuda en la cuenta corriente del cliente" (no genera un pago, genera
// un cargo). No es un MedioPago real.
export const CUENTA_CORRIENTE = 'cuenta_corriente';

// Proveedores y Plan de ahorro tienen su propio <select> de medio de pago,
// separado de MEDIOS_PAGO de arriba, y con acento en el valor guardado
// ('débito'/'crédito' en vez de 'debito'/'credito') — no es lo ideal tener
// dos convenciones, pero unificarlas tocaría datos ya guardados, así que acá
// se contemplan las dos formas en vez de arriesgar esa migración.
const MEDIO_LABELS_EXTRA: Record<string, string> = {
  débito: 'Débito',
  crédito: 'Crédito',
  cheque: 'Cheque',
};

// t opcional (default identidad) — igual criterio que mensajeComprobantePlanAhorro
// en app/lib/whatsapp.ts: quien llama desde un componente pasa su useT() para
// que la etiqueta salga en el idioma elegido, en vez de quedar siempre en
// español como pasaba antes en Estadísticas, Egresos, Nueva Orden,
// Proveedores y Plan de ahorro.
export function medioLabel(codigo: string, t: (texto: string) => string = (s) => s): string {
  if (codigo === CUENTA_CORRIENTE) return t('Cuenta corriente');
  const label = MEDIOS_PAGO.find((m) => m.codigo === codigo)?.label ?? MEDIO_LABELS_EXTRA[codigo];
  return label ? t(label) : codigo;
}

export function medioIcono(codigo: string): string {
  if (codigo === CUENTA_CORRIENTE) return '📒';
  return MEDIOS_PAGO.find((m) => m.codigo === codigo)?.icono ?? '💰';
}

// --- Saldo ---
export type MovimientoBase = { tipo: string; monto: number | null };

export function calcularSaldo(movimientos: MovimientoBase[]): number {
  return movimientos.reduce((acc, m) => acc + (m.tipo === 'cargo' ? (m.monto || 0) : -(m.monto || 0)), 0);
}

// --- Estado de la cuenta ---
export type EstadoCuenta = 'al_dia' | 'con_saldo' | 'en_mora' | 'suspendido';

export function estadoCuenta(saldo: number, vencido: number, suspendido: boolean): EstadoCuenta {
  if (suspendido) return 'suspendido';
  if (saldo <= 0.009) return 'al_dia'; // tolerancia por redondeo
  if (vencido > 0.009) return 'en_mora';
  return 'con_saldo';
}

// Clases de Tailwind que ya usa Qovento (good / warn / bad / muted) para
// pintar cada estado de forma consistente con el resto de la app.
export const ESTADO_INFO: Record<EstadoCuenta, { label: string; texto: string; fondo: string }> = {
  al_dia: { label: 'Al día', texto: 'text-good', fondo: 'bg-good/10 text-good' },
  con_saldo: { label: 'Con saldo', texto: 'text-warn', fondo: 'bg-warn/10 text-warn' },
  en_mora: { label: 'En mora', texto: 'text-bad', fondo: 'bg-bad/10 text-bad' },
  suspendido: { label: 'Suspendido', texto: 'text-muted', fondo: 'bg-muted/10 text-muted dark:text-dark-text-secondary' },
};

// Días de mora del cargo vencido más antiguo (para "vencido hace N días").
export function diasDeMora(vencimientoMasAntiguo: string | null | undefined): number | null {
  if (!vencimientoMasAntiguo) return null;
  const venc = new Date(vencimientoMasAntiguo);
  const hoy = new Date();
  venc.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy.getTime() - venc.getTime()) / 86400000);
  return dias > 0 ? dias : null;
}

// Suma una cantidad de días a hoy y devuelve una fecha 'YYYY-MM-DD' (para
// el vencimiento de una venta a crédito según el plazo del cliente).
export function vencimientoDesdeHoy(plazoDias: number | null | undefined): string | null {
  if (!plazoDias || plazoDias <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + plazoDias);
  return d.toISOString().slice(0, 10);
}
