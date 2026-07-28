'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';

type Compra = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  detalles: string | null;
  precio: number | null;
  estado: string;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

export default function DetalleCompra() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [compra, setCompra] = useState<Compra | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('compras')
        .select('*, clientes ( nombre, apellido, telefono )')
        .eq('id', id)
        .single();
      setCompra(data as any);
      setLoading(false);
    })();
  }, [id]);

  const agregarAlStock = async () => {
    if (!compra) return;
    if (!confirm('¿Agregar este dispositivo al Stock para venderlo?')) return;
    setProcesando(true);
    setError(null);

    const { error: insertError } = await supabase.from('dispositivos').insert({
      modelo: compra.modelo,
      capacidad_gb: compra.capacidad_gb,
      imei: compra.imei,
      estado: 'usado',
      en_stock: true,
    });
    if (insertError) {
      setError('No pudimos agregar al stock: ' + insertError.message);
      setProcesando(false);
      return;
    }
    await asegurarModelo(supabase, compra.modelo);
    await supabase.from('compras').update({ estado: 'en_stock' }).eq('id', id);
    setCompra({ ...compra, estado: 'en_stock' });
    setProcesando(false);
  };

  const derivarAServicioTecnico = async () => {
    if (!compra) return;
    if (!confirm('¿Derivar este dispositivo a Servicio Técnico?')) return;
    setProcesando(true);
    setError(null);

    const { error: insertError } = await supabase.from('canjes').insert({
      modelo: compra.modelo,
      capacidad_gb: compra.capacidad_gb,
      imei: compra.imei,
      detalles: compra.detalles,
      estado: 'servicio_tecnico',
      fecha_ingreso_servicio: new Date().toISOString(),
    });
    if (insertError) {
      setError('No pudimos derivar: ' + insertError.message);
      setProcesando(false);
      return;
    }
    await supabase.from('compras').update({ estado: 'servicio_tecnico' }).eq('id', id);
    setCompra({ ...compra, estado: 'servicio_tecnico' });
    setProcesando(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!compra) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">No encontramos esa compra.</p>
        <Link href="/compras" className="text-sm text-accent underline">
          Volver a compras
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/compras" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Compra</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white border border-border shadow-card px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted">Cliente: </span>
          {compra.clientes ? `${compra.clientes.nombre} ${compra.clientes.apellido || ''}` : 'Sin cliente'}
        </p>
        {compra.clientes?.telefono && (
          <p>
            <span className="text-muted">Teléfono: </span>
            {compra.clientes.telefono}
          </p>
        )}
        <p>
          <span className="text-muted">Dispositivo: </span>
          {compra.modelo}
          {compra.capacidad_gb ? ` · ${compra.capacidad_gb}GB` : ''}
        </p>
        {compra.imei && (
          <p>
            <span className="text-muted">IMEI: </span>
            <span className="font-bold font-mono">{compra.imei}</span>
          </p>
        )}
        {compra.detalles && (
          <p>
            <span className="text-muted">Detalles: </span>
            {compra.detalles}
          </p>
        )}
        {compra.precio != null && (
          <p>
            <span className="text-muted">Precio pagado: </span>${compra.precio.toLocaleString('es-AR')}
          </p>
        )}
      </div>

      {compra.estado === 'pendiente' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted font-medium">¿Qué hacemos con este dispositivo?</p>
          <button
            disabled={procesando}
            onClick={agregarAlStock}
            className="w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            Agregar al Stock
          </button>
          <button
            disabled={procesando}
            onClick={derivarAServicioTecnico}
            className="w-full rounded-2xl border border-border py-4 text-center text-base font-medium disabled:opacity-40"
          >
            Derivar a Servicio Técnico
          </button>
        </div>
      ) : (
        <p className="text-sm text-good bg-good/10 rounded-lg px-3 py-2">
          {compra.estado === 'en_stock' ? '✓ Ya está en el Stock, listo para vender.' : '✓ Derivado a Servicio Técnico.'}
        </p>
      )}

      <Link
        href={`/compras/${compra.id}/boleta`}
        className="mt-auto w-full rounded-2xl border border-border py-3 text-center text-sm font-medium"
      >
        Ver boleta
      </Link>
    </main>
  );
}
