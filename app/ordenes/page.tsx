'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
  orden_items: { descripcion: string; tipo: string }[];
};

const ESTADOS = ['todas', 'pendiente', 'pagado', 'entregado'];

export default function Ordenes() {
  const supabase = crearClienteNavegador();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todas');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ordenes')
        .select('*, clientes ( nombre, apellido ), orden_items ( descripcion, tipo )')
        .order('created_at', { ascending: false });
      setOrdenes((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtradas = useMemo(() => {
    if (filtroEstado === 'todas') return ordenes;
    return ordenes.filter((o) => o.estado === filtroEstado);
  }, [ordenes, filtroEstado]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Órdenes</span>
      </header>

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium capitalize ${
              filtroEstado === e ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <Link
        href="/ordenes/nueva"
        className="w-full rounded-2xl border border-black/15 py-3 text-center text-sm font-medium"
      >
        + Nueva orden
      </Link>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}

      {!loading && filtradas.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">No hay órdenes para mostrar.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((o) => (
          <Link
            key={o.id}
            href={`/ordenes/${o.id}`}
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {o.orden_items.length > 0
                  ? `${o.orden_items[0].descripcion}${o.orden_items.length > 1 ? ` +${o.orden_items.length - 1}` : ''}`
                  : 'Orden vacía'}
                {o.orden_items.length > 0 && (
                  <span className="text-xs font-normal text-muted">
                    {' '}
                    — {o.orden_items.every((i) => i.tipo === 'trabajo') ? 'Servicio técnico' : 'Venta'}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}` : 'Sin cliente'}
              </p>
            </div>
            <div className="text-right">
              {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted capitalize">{o.estado}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
