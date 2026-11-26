'use client';

import Link from 'next/link';
import type { CompraParaStock } from './lib/compras';
import { useT } from './lib/idioma';
import { formatearGB } from './lib/almacenamiento';

function detalleDe(c: CompraParaStock) {
  return [c.modelo, c.capacidad_gb ? `${formatearGB(c.capacidad_gb, true)}` : null, c.color].filter(Boolean).join(' · ');
}

// Aviso de "este equipo ya está en Compras": al cargar un dispositivo a mano en Stock, si el IMEI (o,
// sin IMEI, el modelo) coincide con una compra pendiente (todavía no ingresada al Stock), se avisa y
// se manda a la compra — ahí ya existe el botón "Agregar al Stock" con su propia lógica (precio,
// batería, Standby/Servicio Técnico); no se duplica esa lógica acá, solo se evita cargarlo de cero.
export default function AvisoCompra({ porImei, porModelo }: { porImei: CompraParaStock[]; porModelo: CompraParaStock[] }) {
  const t = useT();

  if (porImei.length === 0 && porModelo.length === 0) return null;

  const fila = (c: CompraParaStock) => (
    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-3 py-2">
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-ink dark:text-dark-text truncate">{detalleDe(c) || t('Sin modelo')}</p>
        <p className="text-muted dark:text-dark-text-secondary">
          {c.imei ? `IMEI ${c.imei}` : t('Sin IMEI')}
          {c.precio ? ` · $${c.precio}` : ''}
        </p>
      </div>
      <Link href={`/compras/${c.id}`} className="shrink-0 rounded-full bg-accent dark:bg-dark-accent px-3 py-1.5 text-xs font-medium text-white">
        {t('Ir a la compra')}
      </Link>
    </div>
  );

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warn/10 border border-warn/40 px-3 py-3">
      {porImei.length > 0 ? (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Este dispositivo se encuentra en Compras')}</p>
          <p className="text-xs text-ink dark:text-dark-text">{t('Agregalo desde ahí para no cargarlo de cero y duplicarlo en el Stock.')}</p>
          {porImei.slice(0, 5).map(fila)}
          {porImei.length > 5 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              + {porImei.length - 5} {t('más en Compras')}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">⚠ {t('Hay compras de este modelo pendientes de ingresar. ¿Es alguna de estas?')}</p>
          {porModelo.slice(0, 5).map(fila)}
          {porModelo.length > 5 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              + {porModelo.length - 5} {t('más en Compras')}
            </p>
          )}
        </>
      )}
      <Link href="/compras" className="text-xs text-accent dark:text-dark-accent underline self-start">
        {t('Ver Compras')}
      </Link>
    </div>
  );
}
