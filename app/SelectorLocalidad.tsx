'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import { obtenerLocalidades, crearLocalidad, type Localidad } from './lib/localidades';
import { useT } from './lib/idioma';

// Elige la localidad/zona de una LISTA (para que no se escriba distinto cada
// vez). Se puede sumar una nueva sin salir de la pantalla. Si el negocio todavía
// no activó la lista (migración sin correr), cae al campo de texto de siempre.
const CAMPO = 'w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm';
const NUEVA = '__nueva__';

export default function SelectorLocalidad({
  value,
  onChange,
  label,
  className = CAMPO,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const [lista, setLista] = useState<Localidad[] | null | undefined>(undefined);
  const [agregando, setAgregando] = useState(false);
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const l = await obtenerLocalidades(supabase);
      if (vigente) setLista(l);
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotulo = label ? <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label> : null;

  if (lista === undefined) return <div>{rotulo}<div className={`${className} opacity-50`}>…</div></div>;

  // Sin lista activada: texto libre como siempre.
  if (lista === null) {
    return (
      <div>
        {rotulo}
        <input value={value} onChange={(e) => onChange(e.target.value)} className={className} />
      </div>
    );
  }

  const guardarNueva = async () => {
    setError(null);
    const r = await crearLocalidad(supabase, nueva);
    if ('error' in r) {
      setError(t(r.error));
      return;
    }
    setLista((l) => (l && !l.some((x) => x.id === r.id) ? [...l, r].sort((a, b) => a.nombre.localeCompare(b.nombre)) : l));
    onChange(r.nombre);
    setAgregando(false);
    setNueva('');
  };

  // Un valor viejo escrito a mano que no está en la lista se conserva visible.
  const fueraDeLista = value && !lista.some((l) => l.nombre === value);

  return (
    <div>
      {rotulo}
      <select
        value={agregando ? NUEVA : value}
        onChange={(e) => {
          if (e.target.value === NUEVA) setAgregando(true);
          else {
            setAgregando(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="">{t('Sin localidad')}</option>
        {fueraDeLista && <option value={value}>{value}</option>}
        {lista.map((l) => (
          <option key={l.id} value={l.nombre}>
            {l.nombre}
          </option>
        ))}
        <option value={NUEVA}>➕ {t('Agregar una localidad nueva…')}</option>
      </select>
      {agregando && (
        <div className="flex gap-2 mt-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder={t('Nombre de la localidad')}
            autoFocus
            className={`${className} flex-1`}
          />
          <button type="button" onClick={guardarNueva} className="rounded-xl bg-accent dark:bg-dark-accent text-white px-4 text-sm font-medium">
            {t('Agregar')}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-bad mt-1">{error}</p>}
    </div>
  );
}
