'use client';

import { guiaAFormulario, guiaDeFormulario, textoGuia, type MaxCuotas } from './lib/financiacionGuia';
import { useT } from './lib/idioma';

// Campo "Financiación" de un producto / categoría: hereda, sin financiación, o
// financia hasta X cuotas. `value` es el texto del formulario ('' hereda, '0' sin
// financiación, 'N' hasta N cuotas) — se convierte con guiaDeFormulario al guardar.
const OPC = { HEREDA: 'hereda', SIN: 'sin', HASTA: 'hasta' } as const;
const CAMPO = 'w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';

export default function SelectorFinanciacion({
  value,
  onChange,
  heredado,
  conHerencia = true,
  etiquetaHereda,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  // Lo que valdría si se hereda (guía de la categoría), solo para mostrarlo.
  heredado?: MaxCuotas;
  conHerencia?: boolean;
  // Texto de la opción "sin definir" cuando no es "Según la categoría" (ej. en la propia categoría).
  etiquetaHereda?: string;
  label?: string;
}) {
  const t = useT();
  const max = guiaDeFormulario(value);
  const modo = max == null ? OPC.HEREDA : max === 0 ? OPC.SIN : OPC.HASTA;

  const cambiarModo = (m: string) => {
    if (m === OPC.HEREDA) onChange('');
    else if (m === OPC.SIN) onChange('0');
    else onChange(max && max > 0 ? String(max) : '6');
  };

  return (
    <div>
      {label && <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>}
      <div className="flex gap-2">
        <select value={modo} onChange={(e) => cambiarModo(e.target.value)} className={`${CAMPO} flex-1`}>
          {conHerencia && (
            <option value={OPC.HEREDA}>
              {etiquetaHereda ??
                `${t('Según la categoría')}${heredado != null ? ` (${textoGuia(heredado, t)?.replace(/^\S+\s/, '')})` : ` (${t('sin guía')})`}`}
            </option>
          )}
          <option value={OPC.SIN}>🚫 {t('Sin financiación (solo contado, transferencia o débito)')}</option>
          <option value={OPC.HASTA}>💳 {t('Financia hasta X cuotas')}</option>
        </select>
        {modo === OPC.HASTA && (
          <input
            value={guiaAFormulario(max)}
            onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            aria-label={t('Cantidad máxima de cuotas')}
            className={`${CAMPO} w-20`}
          />
        )}
      </div>
    </div>
  );
}
