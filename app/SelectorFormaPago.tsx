'use client';

import { CUENTA_CORRIENTE, MEDIOS_PAGO } from './lib/cuentaCorriente';
import { etiquetaDeMedios, mediosDeEtiqueta } from './lib/formaPago';
import { useT } from './lib/idioma';

// Elegir cómo se paga: los mismos medios que Nueva Orden (Efectivo,
// Transferencia, Débito, Crédito). Tocar más de uno = pago mixto, y el valor
// guardado es el desglose legible ("Efectivo + Transferencia"), igual que en
// una venta. Cuenta corriente es excluyente: genera una deuda por el total,
// no se combina con otros medios acá.
export default function SelectorFormaPago({
  value,
  onChange,
  permitirCuentaCorriente = false,
}: {
  value: string;
  onChange: (etiqueta: string) => void;
  permitirCuentaCorriente?: boolean;
}) {
  const t = useT();
  const elegidos = mediosDeEtiqueta(value);
  // Un valor viejo ("Tarjeta") no es ni débito ni crédito: se muestra como
  // chip aparte, seleccionado, hasta que se elija uno de los nuevos.
  const valorViejo = value.trim() && elegidos.length === 0 ? value.trim() : null;

  const alternar = (codigo: string) => {
    if (codigo === CUENTA_CORRIENTE) {
      onChange(etiquetaDeMedios([CUENTA_CORRIENTE]));
      return;
    }
    const sinCuentaCorriente = elegidos.filter((c) => c !== CUENTA_CORRIENTE);
    const siguiente = sinCuentaCorriente.includes(codigo) ? sinCuentaCorriente.filter((c) => c !== codigo) : [...sinCuentaCorriente, codigo];
    // Siempre queda al menos un medio elegido.
    if (siguiente.length === 0) return;
    onChange(etiquetaDeMedios(siguiente));
  };

  const clase = (activo: boolean) =>
    `rounded-xl px-3 py-2 text-sm font-medium ${
      activo ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
    }`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {valorViejo && (
          <button type="button" className={clase(true)} onClick={() => undefined}>
            {t(valorViejo)}
          </button>
        )}
        {MEDIOS_PAGO.map((m) => (
          <button key={m.codigo} type="button" onClick={() => alternar(m.codigo)} className={clase(elegidos.includes(m.codigo))}>
            {m.icono} {t(m.label)}
          </button>
        ))}
        {permitirCuentaCorriente && (
          <button type="button" onClick={() => alternar(CUENTA_CORRIENTE)} className={clase(elegidos.includes(CUENTA_CORRIENTE))}>
            📒 {t('Cuenta corriente')}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary">
        {elegidos.length > 1 ? `${t('Pago mixto:')} ${value}` : t('Tocá más de uno para cobrar con varios medios (mixto).')}
      </p>
    </div>
  );
}
