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
const TIPOS: { id: 'todas' | 'ventas' | 'servicio'; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'servicio', label: 'Servicio técnico' },
];

// Mismo criterio que ya se usaba solo para la etiqueta de cada tarjeta:
// una orden es "de servicio técnico" si todos sus ítems son trabajos
// (nunca hay un dispositivo/producto vendido junto), típicamente porque
// viene de recibir un equipo a reparar o de cobrar un arreglo.
function esServicioTecnico(o: Orden) {
  return o.orden_items.length > 0 && o.orden_items.every((i) => i.tipo === 'trabajo');
}

export default function Ordenes() {
  const supabase = crearClienteNavegador();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'ventas' | 'servicio'>('todas');

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
    return ordenes
      .filter((o) => filtroEstado === 'todas' || o.estado === filtroEstado)
      .filter((o) => {
        if (filtroTipo === 'todas') return true;
        return filtroTipo === 'servicio' ? esServicioTecnico(o) : !esServicioTecnico(o);
      });
  }, [ordenes, filtroEstado, filtroTipo]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Órdenes</span>
      </header>

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFiltroTipo(t.id)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
              filtroTipo === t.id ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium capitalize ${
              filtroEstado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <Link
        href="/ordenes/nueva"
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        + Nueva orden
      </Link>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && filtradas.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">No hay órdenes para mostrar.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((o) => (
          <Link
            key={o.id}
            href={`/ordenes/${o.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {o.orden_items.length > 0
                  ? `${o.orden_items[0].descripcion}${o.orden_items.length > 1 ? ` +${o.orden_items.length - 1}` : ''}`
                  : 'Orden vacía'}
                {o.orden_items.length > 0 && (
                  <span className="text-xs font-bold text-accent dark:text-dark-accent">
                    {' '}
                    — {esServicioTecnico(o) ? 'Servicio técnico' : 'Venta'}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}` : 'Sin cliente'}
              </p>
            </div>
            <div className="text-right">
              {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted dark:text-dark-text-secondary capitalize">{o.estado}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
