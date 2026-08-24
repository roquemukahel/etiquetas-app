'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { obtenerTodasLasFilas } from '../../lib/db';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';
import { useT } from '../../lib/idioma';

type Remito = {
  id: string;
  numero: string | null;
  sucursal_origen_id: string;
  sucursal_destino_id: string;
  fecha: string;
  observaciones: string | null;
  usuario: string | null;
};

type ItemRemito = {
  remito_id: string;
  nombre_snapshot: string;
  marca_snapshot: string | null;
  cantidad: number;
};

export default function RemitosInternos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [items, setItems] = useState<ItemRemito[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [remitosData, itemsData, sucursalesData] = await Promise.all([
        obtenerTodasLasFilas<Remito>(supabase, 'remitos_internos', 'id, numero, sucursal_origen_id, sucursal_destino_id, fecha, observaciones, usuario', [
          { columna: 'fecha', ascending: false },
        ]),
        obtenerTodasLasFilas<ItemRemito>(supabase, 'remito_internos_items', 'remito_id, nombre_snapshot, marca_snapshot, cantidad', []),
        obtenerSucursales(supabase, false),
      ]);
      setRemitos(remitosData);
      setItems(itemsData);
      setSucursales(sucursalesData);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsPorRemito = useMemo(() => {
    const mapa = new Map<string, ItemRemito[]>();
    for (const i of items) {
      if (!mapa.has(i.remito_id)) mapa.set(i.remito_id, []);
      mapa.get(i.remito_id)!.push(i);
    }
    return mapa;
  }, [items]);

  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? '—';

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/productos" className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <h1 className="flex-1 text-xl font-semibold">{t('Remitos internos')}</h1>
        {puedeAgregarStock && (
          <Link
            href="/productos/remitos/nuevo"
            className="shrink-0 rounded-lg bg-accent dark:bg-dark-accent text-white text-sm font-medium px-3 py-2 hover:opacity-90"
          >
            {t('Nuevo remito')}
          </Link>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      ) : remitos.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Todavía no se generó ningún remito interno.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {remitos.map((r) => {
            const abierto = expandido === r.id;
            const itemsDelRemito = itemsPorRemito.get(r.id) ?? [];
            return (
              <div key={r.id} className="rounded-lg border border-border dark:border-dark-border overflow-hidden">
                <button
                  onClick={() => setExpandido(abierto ? null : r.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
                >
                  <span className="font-medium">{r.numero ?? '—'}</span>
                  <span className="flex-1 text-muted dark:text-dark-text-secondary truncate">
                    {nombreSucursal(r.sucursal_origen_id)} → {nombreSucursal(r.sucursal_destino_id)}
                  </span>
                  <span className="text-xs text-muted dark:text-dark-text-secondary shrink-0">{new Date(r.fecha).toLocaleDateString()}</span>
                </button>
                {abierto && (
                  <div className="px-3 pb-3 flex flex-col gap-1 border-t border-border dark:border-dark-border pt-2">
                    {itemsDelRemito.map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>
                          {i.nombre_snapshot} {i.marca_snapshot ? `· ${i.marca_snapshot}` : ''}
                        </span>
                        <span className="tabular-nums text-muted dark:text-dark-text-secondary">{i.cantidad}</span>
                      </div>
                    ))}
                    {r.usuario && <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">{t('Generado por')} {r.usuario}</p>}
                    {r.observaciones && <p className="text-xs text-muted dark:text-dark-text-secondary">{r.observaciones}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
