'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

const ESTADOS = ['pendiente', 'pagado', 'entregado'];

type Item = { descripcion: string; cantidad: number; precio_unitario: number; dispositivo_id: string | null };

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
  vendedores: { nombre: string } | null;
  orden_items: Item[];
};

export default function DetalleOrden() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono ), vendedores ( nombre ), orden_items ( descripcion, cantidad, precio_unitario, dispositivo_id )'
        )
        .eq('id', id)
        .single();
      setOrden(data as any);
      setLoading(false);
    })();
  }, [id]);

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!orden) return;
    setGuardando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes')
      .update({ estado: nuevoEstado, fecha_entrega: nuevoEstado === 'entregado' ? new Date().toISOString() : null })
      .eq('id', id);
    if (updateError) {
      setError('No pudimos actualizar el estado: ' + updateError.message);
      setGuardando(false);
      return;
    }
    setOrden({ ...orden, estado: nuevoEstado });
    setGuardando(false);
  };

  const handleCancelar = async () => {
    if (!orden) return;
    if (!confirm('¿Cancelar esta orden? Los dispositivos vuelven a aparecer en stock.')) return;
    setGuardando(true);
    setError(null);

    const dispositivoIds = orden.orden_items.map((i) => i.dispositivo_id).filter(Boolean) as string[];
    if (dispositivoIds.length > 0) {
      await supabase.from('dispositivos').update({ en_stock: true }).in('id', dispositivoIds);
    }
    const { error: deleteError } = await supabase.from('ordenes').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos cancelar la orden: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    router.push('/ordenes');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!orden) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">No encontramos esa orden.</p>
        <Link href="/ordenes" className="text-sm text-accent underline">
          Volver a órdenes
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/ordenes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Orden</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white/60 border border-black/10 px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted">Cliente:</span>{' '}
          {orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}` : 'Sin cliente'}
        </p>
        {orden.clientes?.telefono && (
          <p>
            <span className="text-muted">Teléfono:</span> {orden.clientes.telefono}
          </p>
        )}
        {orden.vendedores?.nombre && (
          <p>
            <span className="text-muted">Vendedor:</span> {orden.vendedores.nombre}
          </p>
        )}
        <p>
          <span className="text-muted">Forma de pago:</span> {orden.forma_pago}
        </p>
        {orden.total != null && (
          <p>
            <span className="text-muted">Total:</span> ${orden.total.toLocaleString('es-AR')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {orden.orden_items.map((i, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between text-sm"
          >
            <span>
              {i.descripcion} × {i.cantidad}
            </span>
            <span className="font-medium">${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>

      <Link
        href={`/ordenes/${orden.id}/boleta`}
        className="w-full rounded-2xl border border-black/15 py-3 text-center text-sm font-medium"
      >
        Ver boleta
      </Link>

      <div>
        <label className="text-xs text-muted block mb-1">Estado</label>
        <div className="flex gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              disabled={guardando}
              onClick={() => cambiarEstado(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize disabled:opacity-40 ${
                orden.estado === e ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={guardando}
        onClick={handleCancelar}
        className="mt-auto w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
      >
        Cancelar orden
      </button>
    </main>
  );
}
