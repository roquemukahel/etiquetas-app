'use client';

const ESTADOS = ['usado', 'sellado'] as const;

// Selector de estado unificado (Stock, Nueva Orden "Cargar nuevo", Compras).
// "Sellado" se destaca con un borde grueso dorado/negro tipo "premium" —
// bien distinto del amarillo pastel de los colores de iPhone — para que se
// note de un vistazo. Mismo criterio visual que usan las tarjetas de Stock
// para marcar un dispositivo sellado (ver app/stock/page.tsx).
export default function SelectorEstadoDispositivo({
  value,
  onChange,
  label = 'Estado',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <div className="flex gap-2">
        {ESTADOS.map((e) => {
          const seleccionado = value === e;
          const sellado = e === 'sellado';
          return (
            <button
              key={e}
              type="button"
              onClick={() => onChange(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-colors ${
                sellado
                  ? seleccionado
                    ? 'border-[3px] border-black dark:border-white bg-gradient-to-b from-amber-300 to-amber-600 text-black shadow-[0_0_0_2px_#b45309]'
                    : 'border-[3px] border-amber-500 dark:border-amber-400 bg-white dark:bg-dark-surface text-amber-700 dark:text-amber-400'
                  : seleccionado
                    ? 'bg-accent dark:bg-dark-accent text-white'
                    : 'border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text'
              }`}
            >
              {e}
            </button>
          );
        })}
      </div>
    </div>
  );
}
