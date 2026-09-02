'use client';

// Patrón de desbloqueo tipo Android: grilla de 3x3 puntos, numerados del 1 al
// 9 (fila por fila) — se usa tanto para CARGARLO (tocás los puntos en el
// orden del patrón real del equipo, se van conectando con una línea) como
// para MOSTRARLO de solo lectura (en la ficha de la reparación y en la
// boleta impresa). El patrón se guarda como texto simple ("1,5,9,7,3"), no
// como imagen — así entra en la misma columna de texto que ya usa
// reparaciones.patron_desbloqueo, sin depender de storage de archivos.
import { useT } from './lib/idioma';

const POSICIONES: { x: number; y: number }[] = [
  { x: 20, y: 20 }, { x: 50, y: 20 }, { x: 80, y: 20 },
  { x: 20, y: 50 }, { x: 50, y: 50 }, { x: 80, y: 50 },
  { x: 20, y: 80 }, { x: 50, y: 80 }, { x: 80, y: 80 },
];

function parsear(valor: string): number[] {
  return valor
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => n >= 1 && n <= 9);
}

export default function PatronDesbloqueo({
  value,
  onChange,
  size = 160,
}: {
  value: string;
  onChange?: (value: string) => void;
  size?: number;
}) {
  const t = useT();
  const secuencia = parsear(value);
  const editable = !!onChange;

  const tocarPunto = (n: number) => {
    if (!onChange) return;
    if (secuencia.includes(n)) return; // el patrón real no repite un punto
    onChange([...secuencia, n].join(','));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 100 100" width={size} height={size} className="select-none">
        {secuencia.slice(1).map((n, i) => {
          const a = POSICIONES[secuencia[i] - 1];
          const b = POSICIONES[n - 1];
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              className="text-accent dark:text-dark-accent"
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}
        {POSICIONES.map((p, i) => {
          const n = i + 1;
          const orden = secuencia.indexOf(n);
          const marcado = orden !== -1;
          return (
            <g
              key={n}
              onClick={() => tocarPunto(n)}
              className={editable ? 'cursor-pointer' : ''}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={marcado ? 9 : 7}
                className={
                  marcado
                    ? 'fill-accent dark:fill-dark-accent'
                    : 'fill-white dark:fill-dark-surface stroke-border dark:stroke-dark-border'
                }
                strokeWidth={marcado ? 0 : 2}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={7}
                className={marcado ? 'fill-white font-semibold' : 'fill-muted dark:fill-dark-text-secondary'}
              >
                {marcado ? orden + 1 : n}
              </text>
            </g>
          );
        })}
      </svg>
      {editable && (
        <button
          type="button"
          onClick={() => onChange!('')}
          disabled={secuencia.length === 0}
          className="text-xs text-accent dark:text-dark-accent underline disabled:opacity-40"
        >
          {t('Reiniciar patrón')}
        </button>
      )}
    </div>
  );
}
