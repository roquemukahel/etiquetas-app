'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { registrarAuditoria } from '../../lib/auditoria';
import { getActor } from '../../lib/actor';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Compra = {
  id: string;
  cliente_id: string | null;
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

  const [editando, setEditando] = useState(false);
  const [editModelo, setEditModelo] = useState('');
  const [editCapacidad, setEditCapacidad] = useState<number | null>(null);
  const [editImei, setEditImei] = useState('');
  const [editDetalles, setEditDetalles] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const nombreCliente = (c: Compra) => (c.clientes ? `${c.clientes.nombre} ${c.clientes.apellido || ''}`.trim() : 'sin cliente');

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
    if (!compra || procesando) return;
    if (!confirm('¿Agregar este dispositivo al Stock para venderlo?')) return;
    setProcesando(true);
    setError(null);

    // Se marca la compra como "en_stock" ANTES de crear el dispositivo, y
    // solo si seguía en "pendiente" en ese momento (condición evaluada en
    // la base). Así, si esta misma compra se llega a abrir en dos pestañas
    // y se toca "Agregar al Stock" en ambas, solo la primera consigue
    // reservarla — la segunda no llega a duplicar el dispositivo.
    const { data: actualizada, error: estadoErr } = await supabase
      .from('compras')
      .update({ estado: 'en_stock' })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select('id');
    if (estadoErr) {
      setError('No pudimos agregar al stock: ' + estadoErr.message);
      setProcesando(false);
      return;
    }
    if (!actualizada || actualizada.length === 0) {
      setError('Esta compra ya había sido procesada (quizás desde otra pestaña). Recargá la página para ver el estado actual.');
      setProcesando(false);
      return;
    }

    const actor = getActor();
    const { error: insertError } = await supabase.from('dispositivos').insert({
      modelo: compra.modelo,
      capacidad_gb: compra.capacidad_gb,
      imei: compra.imei,
      estado: 'usado',
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
    });
    if (insertError) {
      await supabase.from('compras').update({ estado: 'pendiente' }).eq('id', id);
      setError('No pudimos agregar al stock: ' + insertError.message);
      setProcesando(false);
      return;
    }
    await asegurarModelo(supabase, compra.modelo);
    await registrarAuditoria(supabase, {
      accion: `agregó al Stock un dispositivo comprado (${compra.modelo || 'sin modelo'}${compra.imei ? `, IMEI ${compra.imei}` : ''}) de ${nombreCliente(compra)}`,
      entidad: 'compra',
      entidadId: compra.id,
    });
    setCompra({ ...compra, estado: 'en_stock' });
    setProcesando(false);
  };

  const derivarAServicioTecnico = async () => {
    if (!compra || procesando) return;
    if (!confirm('¿Derivar este dispositivo a Servicio Técnico?')) return;
    setProcesando(true);
    setError(null);

    const { data: nueva, error: insertError } = await supabase
      .from('reparaciones')
      .insert({
        cliente_id: compra.cliente_id,
        modelo: compra.modelo,
        capacidad_gb: compra.capacidad_gb,
        imei: compra.imei,
        falla_declarada: compra.detalles,
        estado: 'recibido',
      })
      .select('id, numero_orden')
      .single();
    if (insertError) {
      setError('No pudimos derivar: ' + insertError.message);
      setProcesando(false);
      return;
    }
    await supabase.from('compras').update({ estado: 'servicio_tecnico' }).eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `derivó a Servicio Técnico un dispositivo comprado (${nueva?.numero_orden || ''}, ${compra.modelo || 'sin modelo'}${compra.imei ? `, IMEI ${compra.imei}` : ''}) de ${nombreCliente(compra)}`,
      entidad: 'reparacion',
      entidadId: nueva?.id,
    });
    setCompra({ ...compra, estado: 'servicio_tecnico' });
    setProcesando(false);
  };

  const eliminarCompra = async () => {
    if (!compra || procesando) return;
    if (!confirm('¿Eliminar esta compra? Esta acción no se puede deshacer.')) return;
    setProcesando(true);
    setError(null);

    const { error: deleteError } = await supabase.from('compras').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar la compra: ' + deleteError.message);
      setProcesando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó una compra (${compra.modelo || 'sin modelo'}${compra.imei ? `, IMEI ${compra.imei}` : ''}) de ${nombreCliente(compra)}`,
      entidad: 'compra',
      entidadId: compra.id,
      valorAnterior: { modelo: compra.modelo, capacidad_gb: compra.capacidad_gb, imei: compra.imei, precio: compra.precio },
    });
    router.push('/compras');
    router.refresh();
  };

  const abrirEdicion = () => {
    if (!compra) return;
    setEditModelo(compra.modelo || '');
    setEditCapacidad(compra.capacidad_gb);
    setEditImei(compra.imei || '');
    setEditDetalles(compra.detalles || '');
    setEditPrecio(compra.precio != null ? String(compra.precio) : '');
    setError(null);
    setEditando(true);
  };

  // Al llegar desde la boleta con "Editar boleta" (?editar=1), abre
  // directo el formulario de edición en vez de mostrar primero el
  // detalle de solo lectura.
  const abrioEdicionDesdeQuery = useRef(false);
  useEffect(() => {
    if (compra && !abrioEdicionDesdeQuery.current && new URLSearchParams(window.location.search).get('editar') === '1') {
      abrioEdicionDesdeQuery.current = true;
      abrirEdicion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compra]);

  const guardarEdicion = async () => {
    if (!compra) return;
    setGuardandoEdicion(true);
    setError(null);

    const nuevoModelo = editModelo.trim() || null;
    const nuevoImei = editImei.trim() || null;
    const nuevosDetalles = editDetalles.trim() || null;
    const nuevoPrecio = editPrecio ? Number(editPrecio) : null;

    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    if (compra.modelo !== nuevoModelo) cambios.modelo = { antes: compra.modelo, despues: nuevoModelo };
    if (compra.capacidad_gb !== editCapacidad) cambios.capacidad_gb = { antes: compra.capacidad_gb, despues: editCapacidad };
    if (compra.imei !== nuevoImei) cambios.imei = { antes: compra.imei, despues: nuevoImei };
    if (compra.detalles !== nuevosDetalles) cambios.detalles = { antes: compra.detalles, despues: nuevosDetalles };
    if (compra.precio !== nuevoPrecio) cambios.precio = { antes: compra.precio, despues: nuevoPrecio };

    if (Object.keys(cambios).length === 0) {
      setEditando(false);
      setGuardandoEdicion(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('compras')
      .update({ modelo: nuevoModelo, capacidad_gb: editCapacidad, imei: nuevoImei, detalles: nuevosDetalles, precio: nuevoPrecio })
      .eq('id', id);
    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardandoEdicion(false);
      return;
    }

    if (cambios.modelo) await asegurarModelo(supabase, nuevoModelo);

    await registrarAuditoria(supabase, {
      accion: `editó una compra (${nombreCliente(compra)})`,
      entidad: 'compra',
      entidadId: compra.id,
      valorAnterior: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.antes])),
      valorNuevo: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.despues])),
    });

    setCompra({ ...compra, modelo: nuevoModelo, capacidad_gb: editCapacidad, imei: nuevoImei, detalles: nuevosDetalles, precio: nuevoPrecio });
    setEditando(false);
    setGuardandoEdicion(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!compra) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos esa compra.</p>
        <Link href="/compras" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a compras
        </Link>
      </main>
    );
  }

  if (editando) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setEditando(false)} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">Editar compra</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Modelo</label>
          <input
            value={editModelo}
            onChange={(e) => setEditModelo(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Almacenamiento</label>
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                onClick={() => setEditCapacidad(gb)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  editCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {gb} GB
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">IMEI</label>
          <input
            value={editImei}
            onChange={(e) => setEditImei(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm font-mono"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Detalles</label>
          <textarea
            value={editDetalles}
            onChange={(e) => setEditDetalles(e.target.value)}
            rows={3}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Precio pagado</label>
          <input
            value={editPrecio}
            onChange={(e) => setEditPrecio(e.target.value)}
            inputMode="numeric"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <button
          disabled={guardandoEdicion}
          onClick={guardarEdicion}
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/compras" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Compra</span>
        <button onClick={abrirEdicion} className="text-xs text-accent dark:text-dark-accent underline">
          Editar
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Cliente: </span>
          {compra.clientes ? `${compra.clientes.nombre} ${compra.clientes.apellido || ''}` : 'Sin cliente'}
        </p>
        {compra.clientes?.telefono && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Teléfono: </span>
            {compra.clientes.telefono}
          </p>
        )}
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Dispositivo: </span>
          {compra.modelo}
          {compra.capacidad_gb ? ` · ${compra.capacidad_gb}GB` : ''}
        </p>
        {compra.imei && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">IMEI: </span>
            <span className="font-bold font-mono">{compra.imei}</span>
          </p>
        )}
        {compra.detalles && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Detalles: </span>
            {compra.detalles}
          </p>
        )}
        {compra.precio != null && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Precio pagado: </span>${compra.precio.toLocaleString('es-AR')}
          </p>
        )}
      </div>

      {compra.estado === 'pendiente' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted dark:text-dark-text-secondary font-medium">¿Qué hacemos con este dispositivo?</p>
          <button
            disabled={procesando}
            onClick={agregarAlStock}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            Agregar al Stock
          </button>
          <button
            disabled={procesando}
            onClick={derivarAServicioTecnico}
            className="w-full rounded-2xl border border-border dark:border-dark-border py-4 text-center text-base font-medium disabled:opacity-40"
          >
            Derivar a Servicio Técnico
          </button>
          <button
            disabled={procesando}
            onClick={eliminarCompra}
            className="w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
          >
            Eliminar
          </button>
        </div>
      ) : (
        <p className="text-sm text-good bg-good/10 rounded-lg px-3 py-2">
          {compra.estado === 'en_stock' ? '✓ Ya está en el Stock, listo para vender.' : '✓ Derivado a Servicio Técnico.'}
        </p>
      )}

      <Link
        href={`/compras/${compra.id}/boleta`}
        className="mt-auto w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        Ver boleta
      </Link>
    </main>
  );
}
