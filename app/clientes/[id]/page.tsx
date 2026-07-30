'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';

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
  orden_items: { descripcion: string; tipo: string }[];
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
  const [tab, setTab] = useState<'compras' | 'servicio' | 'datos'>('compras');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clientes').select('*').eq('id', id).single();
      setC(data as Cliente);
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase
        .from('ordenes')
        .select('id, total, estado, created_at, orden_items ( descripcion, tipo )')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false });
      setOrdenes((data as any) ?? []);
    })();
  }, [id]);

  // Una orden que incluye algún arreglo (ítem tipo "trabajo") se clasifica
  // como Servicio Técnico, no como compra — aunque también tenga productos.
  const ordenesServicio = ordenes.filter((o) => o.orden_items.some((i) => i.tipo === 'trabajo'));
  const ordenesCompra = ordenes.filter((o) => !o.orden_items.some((i) => i.tipo === 'trabajo'));

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
    if (!c) return;
    if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
    setGuardando(true);
    const { error: deleteError } = await supabase.from('clientes').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó al cliente ${c.nombre} ${c.apellido || ''}`.trim().replace(/\s+/g, ' '),
      entidad: 'cliente',
      entidadId: c.id,
    });
    router.push('/clientes');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!c) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese cliente.</p>
        <Link href="/clientes" className="text-sm text-accent dark:text-dark-accent underline">
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

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setTab('compras')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'compras' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Compras
        </button>
        <button
          onClick={() => setTab('servicio')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'servicio' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Servicio Técnico
        </button>
        <button
          onClick={() => setTab('datos')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'datos' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Datos
        </button>
      </div>

      {tab === 'datos' && (
        <>
          <div className="flex flex-col gap-3">
            <Campo label="Nombre" valor={c.nombre} onChange={(v) => campo('nombre', v)} />
            <Campo label="Apellido" valor={c.apellido ?? ''} onChange={(v) => campo('apellido', v)} />
            <Campo label="Domicilio" valor={c.domicilio ?? ''} onChange={(v) => campo('domicilio', v)} />
            <Campo label="Email" valor={c.email ?? ''} onChange={(v) => campo('email', v)} />
            <Campo label="Teléfono" valor={c.telefono ?? ''} onChange={(v) => campo('telefono', v)} />
            <Campo label="DNI" valor={c.dni ?? ''} onChange={(v) => campo('dni', v)} />
          </div>

          <button
            disabled={guardando}
            onClick={handleGuardar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
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
        </>
      )}

      {tab === 'compras' && (
        <ListaOrdenes ordenes={ordenesCompra} filtrarTipo={(t) => t !== 'trabajo'} vacio="Todavía no le hiciste ninguna venta a este cliente." />
      )}

      {tab === 'servicio' && (
        <ListaOrdenes ordenes={ordenesServicio} filtrarTipo={(t) => t === 'trabajo'} vacio="Todavía no le hiciste ningún arreglo a este cliente." />
      )}
    </main>
  );
}

function ListaOrdenes({
  ordenes,
  filtrarTipo,
  vacio,
}: {
  ordenes: Orden[];
  filtrarTipo: (tipo: string) => boolean;
  vacio: string;
}) {
  if (ordenes.length === 0) {
    return <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{vacio}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {ordenes.map((o) => {
        const items = o.orden_items.filter((i) => filtrarTipo(i.tipo));
        return (
          <Link
            key={o.id}
            href={`/ordenes/${o.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {items.length > 0 ? `${items[0].descripcion}${items.length > 1 ? ` +${items.length - 1}` : ''}` : 'Orden vacía'}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">{new Date(o.created_at).toLocaleDateString('es-AR')}</p>
            </div>
            <div className="text-right">
              {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted dark:text-dark-text-secondary capitalize">{o.estado}</p>
            </div>
          </Link>
        );
      })}
    </div>
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
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
