'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reparacionesAbiertasConImei, type ReparacionConImei } from './lib/servicioEnStock';
import { infoEstado } from './lib/reparaciones';
import { useT } from './lib/idioma';

// Aviso mientras se carga un equipo al Stock: si su IMEI es el de una orden que sigue abierta en Servicio Técnico, se
// dice ahí mismo. La pregunta "¿ya fue reparado? ¿agregarlo al Stock?" se hace al guardar (ver servicioEnStock.ts).
// Espera a que se haya escrito buena parte del IMEI y no busca en cada tecla.
export default function AvisoServicioTecnico({ supabase, imei }: { supabase: SupabaseClient; imei: string }) {
  const t = useT();
  const [ordenes, setOrdenes] = useState<ReparacionConImei[]>([]);

  useEffect(() => {
    let vivo = true;
    const espera = setTimeout(() => {
      reparacionesAbiertasConImei(supabase, imei, { exacto: false }).then((r) => {
        if (vivo) setOrdenes(r);
      });
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imei]);

  if (ordenes.length === 0) return null;
  const hayPropias = ordenes.some((o) => !o.cliente_id);

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warn/10 border border-warn/40 px-3 py-3">
      <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Este dispositivo se encuentra en Servicio Técnico')}</p>
      <p className="text-xs text-ink dark:text-dark-text">
        {hayPropias
          ? t('Al agregarlo al Stock te vamos a preguntar si ya fue reparado; si decís que sí, esa orden se cierra y deja de aparecer en Servicio Técnico.')
          : t('Es el equipo de un cliente que está en reparación.')}
      </p>
      {ordenes.map((o) => (
        <Link
          key={o.id}
          href={`/servicio-tecnico/${o.id}`}
          className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-3 py-2 text-xs"
        >
          <span className="font-medium text-ink dark:text-dark-text">
            {o.numero_orden || t('Sin número')} · {o.modelo || t('Sin modelo')}
          </span>
          <span className="text-muted dark:text-dark-text-secondary">
            {o.imei ? `IMEI ${o.imei} · ` : ''}
            {t(infoEstado(o.estado).label)}
            {o.cliente_id ? ` · ${t('de un cliente')}` : ''}
          </span>
        </Link>
      ))}
    </div>
  );
}
