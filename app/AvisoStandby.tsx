'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { volverAlStock, type EquipoStandbyAviso } from './lib/standby';
import { getActor, MENSAJE_ACTOR_REQUERIDO } from './lib/actor';
import { useT } from './lib/idioma';
import { formatearGB } from './lib/almacenamiento';

function detalleDe(e: EquipoStandbyAviso) {
  return [e.modelo, e.capacidad_gb ? `${formatearGB(e.capacidad_gb, true)}` : null, e.color].filter(Boolean).join(' · ');
}

// Aviso de "este equipo ya está en Standby": mismo criterio que AvisoCanje. Al cargar un dispositivo a mano, si el
// IMEI (o, sin IMEI, el modelo) coincide con un equipo que espera en Standby, se avisa y se ofrece pasarlo al Stock
// desde ahí para no cargarlo de cero y duplicarlo. El aviso se va solo cuando el IMEI deja de coincidir.
export default function AvisoStandby({
  supabase,
  porImei,
  porModelo,
  onAgregado,
  soloAviso = false,
}: {
  supabase: SupabaseClient;
  porImei: EquipoStandbyAviso[];
  porModelo: EquipoStandbyAviso[];
  onAgregado: () => void;
  // Para pantallas donde el equipo todavía no se está pasando al Stock: solo se avisa y se manda a Standby.
  soloAviso?: boolean;
}) {
  const t = useT();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (porImei.length === 0 && porModelo.length === 0) return null;

  const pasarAlStock = async (e: EquipoStandbyAviso) => {
    if (procesando) return;
    if (!getActor()) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (!confirm(t('¿Pasar este dispositivo de Standby al Stock para venderlo?'))) return;
    setProcesando(e.id);
    setError(null);
    const resultado = await volverAlStock(supabase, e);
    setProcesando(null);
    if (resultado.error) {
      setError(`${t('No pudimos pasarlo al Stock:')} ${t(resultado.error)}`);
      return;
    }
    onAgregado();
  };

  const fila = (e: EquipoStandbyAviso) => (
    <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-3 py-2">
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-ink dark:text-dark-text truncate">{detalleDe(e) || t('Sin modelo')}</p>
        <p className="text-muted dark:text-dark-text-secondary">
          {e.imei ? `IMEI ${e.imei}` : t('Sin IMEI')}
          {e.espera_motivo ? ` · ${e.espera_motivo}` : ''}
        </p>
      </div>
      {!soloAviso && (
        <button
          type="button"
          onClick={() => pasarAlStock(e)}
          disabled={procesando != null}
          className="shrink-0 rounded-full bg-accent dark:bg-dark-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {procesando === e.id ? t('Agregando...') : t('Pasar al Stock desde Standby')}
        </button>
      )}
    </div>
  );

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warn/10 border border-warn/40 px-3 py-3">
      {porImei.length > 0 ? (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Este dispositivo se encuentra en Standby')}</p>
          <p className="text-xs text-ink dark:text-dark-text">{t('Pasalo al Stock desde ahí para no cargarlo de cero y duplicarlo.')}</p>
          {porImei.slice(0, 5).map(fila)}
          {porImei.length > 5 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              + {porImei.length - 5} {t('más en Standby')}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Hay dispositivos de este modelo esperando en Standby. ¿Es alguno de estos?')}</p>
          {porModelo.slice(0, 5).map(fila)}
          {porModelo.length > 5 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              + {porModelo.length - 5} {t('más en Standby')}
            </p>
          )}
        </>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
      <Link href="/standby" className="text-xs text-accent dark:text-dark-accent underline self-start">
        {t('Ver Standby')}
      </Link>
    </div>
  );
}
