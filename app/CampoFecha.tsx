'use client';

// Selector de fecha Día/Mes/Año — reemplaza <input type="date"> en todo el
// proyecto. El motivo: el orden en que un <input type="date"> nativo MUESTRA
// la fecha (DD/MM vs MM/DD) lo decide el idioma configurado en el NAVEGADOR
// de cada usuario, no el lang="es" del <html> ni nada que controlemos desde
// acá — un cliente con el navegador en inglés ve mes/día invertido sin que
// haya forma de evitarlo con un <input type="date">. Tres <select> elimina
// la ambigüedad para cualquiera, siempre. Mismo contrato que el input nativo
// que reemplaza: value/onChange en 'YYYY-MM-DD'.
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function diasEnMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

export default function CampoFecha({
  value,
  onChange,
  disabled,
  className = '',
  classNameSelect,
  ancho = 'auto',
  ariaLabel,
}: {
  value: string; // 'YYYY-MM-DD' o ''
  onChange: (iso: string) => void;
  disabled?: boolean;
  className?: string;
  classNameSelect?: string;
  ancho?: 'auto' | 'completo'; // 'auto' = compacto en línea (filtros) · 'completo' = ocupa el ancho del formulario
  ariaLabel?: string;
}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  const anio = m ? Number(m[1]) : undefined;
  const mes = m ? Number(m[2]) : undefined;
  const dia = m ? Number(m[3]) : undefined;

  const anioActual = new Date().getFullYear();
  const base = anio && Math.abs(anio - anioActual) > 6 ? anio : anioActual;
  const anios = Array.from({ length: 13 }, (_, i) => base - 6 + i);

  const clase =
    classNameSelect ??
    'bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm disabled:opacity-40';
  const anchoSelect = ancho === 'completo' ? 'w-full' : '';
  const contenedor = ancho === 'completo' ? 'grid grid-cols-3 gap-1.5' : 'inline-flex items-center gap-1';

  const emitir = (d?: number, mm?: number, a?: number) => {
    if (!d || !mm || !a) return;
    const diaClamp = Math.min(d, diasEnMes(a, mm));
    onChange(`${a}-${String(mm).padStart(2, '0')}-${String(diaClamp).padStart(2, '0')}`);
  };

  return (
    <div className={`${contenedor} ${className}`} aria-label={ariaLabel} role={ariaLabel ? 'group' : undefined}>
      <select
        value={dia ?? ''}
        disabled={disabled}
        onChange={(e) => emitir(Number(e.target.value), mes, anio)}
        className={`${clase} ${anchoSelect}`}
      >
        <option value="" disabled>
          Día
        </option>
        {Array.from({ length: mes && anio ? diasEnMes(anio, mes) : 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={mes ?? ''}
        disabled={disabled}
        onChange={(e) => emitir(dia, Number(e.target.value), anio)}
        className={`${clase} ${anchoSelect}`}
      >
        <option value="" disabled>
          Mes
        </option>
        {MESES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>
            {nombre}
          </option>
        ))}
      </select>
      <select
        value={anio ?? ''}
        disabled={disabled}
        onChange={(e) => emitir(dia, mes, Number(e.target.value))}
        className={`${clase} ${anchoSelect}`}
      >
        <option value="" disabled>
          Año
        </option>
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}
