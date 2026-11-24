'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { obtenerTodasLasFilas } from '../lib/db';
import { soportaMigracion } from '../lib/migraciones';
import { formatearFechaHora } from '../lib/fechas';
import { useT, useIdioma } from '../lib/idioma';
import { localeDe } from '../lib/i18n/traducir';

type Credito = {
  id: string;
  orden_id: string | null;
  cliente_id: string | null;
  vendedor_nombre: string | null;
  productos: string | null;
  cuotas: number;
  maximo: number;
  motivo: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
};

// Créditos que se otorgaron con más cuotas que las permitidas por la guía de
// financiación del producto (o sobre un producto sin financiación): cada uno con
// fecha, vendedor, producto, cuotas y el motivo que se escribió para seguir.
export default function CreditosFueraDeGuia() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const idioma = useIdioma();
  const puedeVer = tienePermiso(actor, 'ver_estadisticas');

  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [soporta, setSoporta] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [vendedor, setVendedor] = useState('');

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    (async () => {
      const ok = await soportaMigracion(supabase, 'creditosFueraGuia');
      setSoporta(ok);
      if (ok) {
        setCreditos(
          await obtenerTodasLasFilas<Credito>(
            supabase,
            'creditos_fuera_guia',
            'id, orden_id, cliente_id, vendedor_nombre, productos, cuotas, maximo, motivo, created_at, clientes ( nombre, apellido )',
            [{ columna: 'created_at', ascending: false }]
          )
        );
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const vendedores = useMemo(() => Array.from(new Set(creditos.map((c) => c.vendedor_nombre).filter((v): v is string => !!v))).sort(), [creditos]);
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return creditos.filter((c) => {
      if (vendedor && c.vendedor_nombre !== vendedor) return false;
      if (!q) return true;
      const cliente = c.clientes ? `${c.clientes.nombre} ${c.clientes.apellido ?? ''}` : '';
      return [c.productos, c.motivo, c.vendedor_nombre, cliente].filter(Boolean).some((x) => x!.toLowerCase().includes(q));
    });
  }, [creditos, busqueda, vendedor]);

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver esto.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/ordenes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Créditos fuera de la guía')}</span>
      </header>
      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('Créditos que se dieron con más cuotas de las que permite la guía de financiación del producto. Cada uno quedó con el motivo que escribió quien lo cargó.')}
      </p>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      ) : soporta === false ? (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">
          {t('Esta función todavía no está activada en la base de datos (financiacion_guia_cartera_supabase.sql).')}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('Buscar por producto, cliente, vendedor o motivo...')}
              className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-2.5 text-sm"
            />
            {vendedores.length > 0 && (
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                aria-label={t('Vendedor')}
                className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">{t('Todos los vendedores')}</option>
                {vendedores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filtrados.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('No hay créditos fuera de la guía. Todo dentro de lo permitido.')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtrados.map((c) => (
                <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{c.productos || t('Sin detalle')}</p>
                    <span className="shrink-0 rounded-full bg-warn/10 text-warn text-[11px] font-semibold px-2 py-0.5">
                      {c.cuotas} {t('cuotas')} · {c.maximo === 0 ? t('sin financiación') : `${t('máx.')} ${c.maximo}`}
                    </span>
                  </div>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {formatearFechaHora(c.created_at, localeDe(idioma))}
                    {c.vendedor_nombre ? ` · ${t('Vendedor')}: ${c.vendedor_nombre}` : ''}
                    {c.clientes ? ` · ${c.clientes.nombre} ${c.clientes.apellido ?? ''}`.trimEnd() : ''}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted dark:text-dark-text-secondary">{t('Motivo')}:</span> {c.motivo}
                  </p>
                  {c.orden_id && (
                    <Link href={`/ordenes/${c.orden_id}`} className="text-xs text-accent dark:text-dark-accent underline self-start">
                      {t('Ver orden')}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
