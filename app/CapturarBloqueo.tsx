'use client';

// Grupo de campos para el bloqueo del equipo al recepcionarlo (opcional):
// Ninguno / PIN / Patrón / Contraseña. Se usa igual en los 3 puntos donde
// hoy se recibe un equipo (Servicio Técnico directo, derivar desde una
// orden existente, derivar al confirmar una orden nueva) y en la ficha de
// la reparación — un solo lugar para no repetir esta UI 4 veces ni que se
// desincronicen entre sí.
import { TIPOS_BLOQUEO, type TipoBloqueo } from './lib/reparaciones';
import { useT } from './lib/idioma';
import PatronDesbloqueo from './PatronDesbloqueo';

export default function CapturarBloqueo({
  tipoBloqueo,
  onTipoBloqueoChange,
  codigo,
  onCodigoChange,
  patron,
  onPatronChange,
}: {
  tipoBloqueo: TipoBloqueo | '';
  onTipoBloqueoChange: (v: TipoBloqueo | '') => void;
  codigo: string;
  onCodigoChange: (v: string) => void;
  patron: string;
  onPatronChange: (v: string) => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted dark:text-dark-text-secondary block">{t('Bloqueo del equipo (opcional)')}</label>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onTipoBloqueoChange('')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            tipoBloqueo === '' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
          }`}
        >
          {t('Ninguno')}
        </button>
        {TIPOS_BLOQUEO.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onTipoBloqueoChange(op.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tipoBloqueo === op.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
            }`}
          >
            {t(op.label)}
          </button>
        ))}
      </div>

      {(tipoBloqueo === 'pin' || tipoBloqueo === 'contrasena') && (
        <input
          value={codigo}
          onChange={(e) => onCodigoChange(e.target.value)}
          placeholder={tipoBloqueo === 'pin' ? t('PIN') : t('Contraseña')}
          inputMode={tipoBloqueo === 'pin' ? 'numeric' : 'text'}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm font-mono"
        />
      )}

      {tipoBloqueo === 'patron' && (
        <div className="flex justify-center py-2">
          <PatronDesbloqueo value={patron} onChange={onPatronChange} size={140} />
        </div>
      )}
    </div>
  );
}
