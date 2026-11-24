'use client';

import { useT } from './lib/idioma';

// Debajo del total de un comprobante de cobro de cuenta corriente: cuánto debía el cliente antes de pagar, cuánto pagó y qué
// saldo le queda. Los números salen de resumenDeCobro (app/lib/cuentaCorriente.ts).
export default function ResumenSaldoCobro({
  deudaAnterior,
  pagado,
  saldoRestante,
  etiquetaPago,
  cuota,
  fmt,
}: {
  deudaAnterior: number;
  pagado: number;
  saldoRestante: number;
  // "Este pago" o "Este crédito", según lo que se esté comprobando.
  etiquetaPago: string;
  // Si el cobro fue a una cuota de una financiación: cuál y cuánto le falta.
  cuota?: { numero: number; saldoRestante: number } | null;
  fmt: (n: number) => string;
}) {
  const t = useT();
  const alDia = Math.abs(saldoRestante) < 0.01;
  const aFavor = saldoRestante <= -0.01;
  return (
    <div className="self-end w-full max-w-[280px] rounded-lg bg-canvas px-3 py-2 text-sm flex flex-col gap-1">
      <div className="flex justify-between text-muted">
        <span>{t('Deuda antes de este pago')}</span>
        <span>{fmt(deudaAnterior)}</span>
      </div>
      <div className="flex justify-between text-muted">
        <span>{etiquetaPago}</span>
        <span>-{fmt(pagado)}</span>
      </div>
      <div className="flex justify-between items-baseline border-t border-border pt-1 font-semibold">
        <span>{aFavor ? t('Saldo a favor del cliente') : t('Saldo restante')}</span>
        <span>{fmt(Math.abs(saldoRestante))}</span>
      </div>
      {alDia && <p className="text-xs text-good text-right">{t('Cuenta al día')}</p>}
      {cuota && (
        <div className="flex justify-between text-xs text-muted">
          <span>
            {t('Cuota')} {cuota.numero} — {t('saldo restante')}
          </span>
          <span>{fmt(cuota.saldoRestante)}</span>
        </div>
      )}
    </div>
  );
}
