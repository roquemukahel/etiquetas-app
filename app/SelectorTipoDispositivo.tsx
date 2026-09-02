'use client';

// Qué tipo de equipo se está recibiendo — se usa en los 3 puntos donde hoy
// se recibe uno (Servicio Técnico directo, derivar desde una orden
// existente, derivar al confirmar una orden nueva). Elegir un tipo distinto
// a "Celular" oculta el checklist técnico (cámaras, Face ID, MagSafe, pin de
// carga…), que es específico de celular y no aplica a una notebook, una
// tablet o un parlante.
import { TIPOS_DISPOSITIVO, type TipoDispositivo } from './lib/reparaciones';
import { useT } from './lib/idioma';

export default function SelectorTipoDispositivo({
  value,
  onChange,
}: {
  value: TipoDispositivo;
  onChange: (v: TipoDispositivo) => void;
}) {
  const t = useT();
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Tipo de equipo')}</label>
      <div className="flex gap-2 flex-wrap">
        {TIPOS_DISPOSITIVO.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onChange(op.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              value === op.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
            }`}
          >
            {t(op.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
