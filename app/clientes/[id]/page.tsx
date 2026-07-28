'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
};

type Orden = {
  id: string;
  total: number | null;
  estado: string;
  created_at: string;
  orden_items: { descripcion: string }[];
};

export default function DetalleCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [c, setC] = useState<Cliente | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clientes').select('*').eq('id', id).single();
      setC(data as Cliente);
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase
        .from('ordenes')
        .select('id, total, estado, created_at, orden_items ( descripcion )')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false });
      setOrdenes((data as any) ?? []);
    })();
  }, [id]);

  const campo = (k: keyof Cliente, valor: string) => setC((prev) => (prev ? { ...prev, [k]: valor } : prev));

  const handleGuardar = async () => {
    if (!c) return;
    setGuardando(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('clientes')
      .update({
        nombre: c.nombre.trim(),
        apellido: c.apellido?.trim() || null,
        domicilio: c.domicilio?.trim() || null,
        email: c.email?.trim() || null,
        telefono: c.telefono?.trim() || null,
        dni: c.dni?.trim() || null,
      })
      .eq('id', id);

    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }

    router.push('/clientes');
    router.refresh();
  };

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
    setGuardando(true);
    const { error: deleteError } = await supabase.from('clientes').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    router.push('/clientes');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!c) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">No encontramos ese cliente.</p>
        <Link href="/clientes" className="text-sm text-accent underline">
          Volver a clientes
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/clientes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">
          {c.nombre} {c.apellido || ''}
        </span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <Campo label="Nombre" valor={c.nombre} onChange={(v) => campo('nombre', v)} />
        <Campo label="Apellido" valor={c.apellido ?? ''} onChange={(v) => campo('apellido', v)} />
        <Campo label="Domicilio" valor={c.domicilio ?? ''} onChange={(v) => campo('domicilio', v)} />
        <Campo label="Email" valor={c.email ?? ''} onChange={(v) => campo('email', v)} />
        <Campo label="Teléfono" valor={c.telefono ?? ''} onChange={(v) => campo('telefono', v)} />
        <Campo label="DNI" valor={c.dni ?? ''} onChange={(v) => campo('dni', v)} />
      </div>

      <div>
        <p className="text-xs text-muted font-medium mb-2">Historial de compras</p>
        {ordenes.length === 0 ? (
          <p className="text-sm text-muted">Todavía no le hiciste ninguna venta a este cliente.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ordenes.map((o) => (
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
                  </p>
                  <p className="text-xs text-muted">{new Date(o.created_at).toLocaleDateString('es-AR')}</p>
                </div>
                <div className="text-right">
                  {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
                  <p className="text-xs text-muted capitalize">{o.estado}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
      <button
        disabled={guardando}
        onClick={handleEliminar}
        className="w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
      >
        Eliminar cliente
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
