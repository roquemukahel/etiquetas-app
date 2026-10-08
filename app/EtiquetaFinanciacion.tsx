'use client';

import { textoGuia, type MaxCuotas } from './lib/financiacionGuia';
import { useT } from './lib/idioma';

// Etiqueta que se ve a simple vista en la tarjeta del producto: "💳 Hasta 6
// cuotas" o "🚫 Sin financiación". Sin guía definida no muestra nada.
export default function EtiquetaFinanciacion({ max, className = '' }: { max: MaxCuotas | undefined; className?: string }) {
  const t = useT();
  if (max == null) return null;
  const sin = max === 0;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        sin ? 'bg-bad/10 text-bad' : 'bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent'
      } ${className}`}
    >
      {textoGuia(max, t)}
    </span>
  );
}
