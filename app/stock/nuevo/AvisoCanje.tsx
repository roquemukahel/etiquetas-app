'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { agregarCanjeAlStock, type CanjeParaStock } from '../../lib/canje';
import { getActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { formatearMonto } from '../../lib/numeros';
import { useT } from '../../lib/idioma';

function detalleDe(c: CanjeParaStock) {
  return [c.modelo, c.capacidad_gb ? `${c.capacidad_gb} GB` : null, c.color].filter(Boolean).join(' · ');
}

// Aviso de "este equipo ya está en Plan Canje": al cargar un dispositivo a mano en Stock, si el
// IMEI (o, sin IMEI, el modelo) coincide con un canje que todavía espera en Plan Canje, se avisa
// y se ofrece pasarlo al Stock desde ahí, para no cargarlo de cero y duplicarlo.
export default function AvisoCanje({
  supabase,
  porImei,
  porModelo,
  sucursalId,
  onAgregado,
}: {
  supabase: SupabaseClient;
  porImei: CanjeParaStock[];
  porModelo: CanjeParaStock[];
  sucursalId: string | null;
  onAgregado: () => void;
}) {
  const t = useT();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (porImei.length === 0 && porModelo.length === 0) return null;

  const agregar = async (c: CanjeParaStock) => {
    if (procesando) return;
    const actor = getActor();
    if (!actor) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (!confirm(t('¿Agregar este dispositivo al Stock para venderlo?'))) return;
    setProcesando(c.id);
    setError(null);
    const resultado = await agregarCanjeAlStock(supabase, c, { sucursalId, actor });
    setProcesando(null);
    if (!resultado.ok) {
      setError(
        resultado.yaAgregado
          ? t('Este canje ya había sido agregado al stock (quizás desde otra pestaña).')
          : `${t('No pudimos agregar al stock:')} ${resultado.mensaje}`
      );
      return;
    }
    onAgregado();
  };

  const fila = (c: CanjeParaStock) => (
    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-3 py-2">
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-ink dark:text-dark-text truncate">{detalleDe(c) || t('Sin modelo')}</p>
        <p className="text-muted dark:text-dark-text-secondary">
          {c.imei ? `IMEI ${c.imei}` : t('Sin IMEI')}
          {c.monto ? ` · ${t('Canje')} $${formatearMonto(c.monto)}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => agregar(c)}
        disabled={procesando != null}
        className="shrink-0 rounded-full bg-accent dark:bg-dark-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {procesando === c.id ? t('Agregando...') : t('Agregar desde Plan Canje')}
      </button>
    </div>
  );

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warn/10 border border-warn/40 px-3 py-3">
      {porImei.length > 0 ? (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Este dispositivo se encuentra en Plan Canje')}</p>
          <p className="text-xs text-ink dark:text-dark-text">
            {t('Agregalo desde ahí para no cargarlo de cero y duplicarlo en el Stock.')}
          </p>
          {porImei.map(fila)}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Hay dispositivos de este modelo esperando en Plan Canje. ¿Es alguno de estos?')}</p>
          {porModelo.slice(0, 5).map(fila)}
          {porModelo.length > 5 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              + {porModelo.length - 5} {t('más en Plan Canje')}
            </p>
          )}
        </>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
      <Link href="/canje" className="text-xs text-accent dark:text-dark-accent underline self-start">
        {t('Ver Plan Canje')}
      </Link>
    </div>
  );
}
