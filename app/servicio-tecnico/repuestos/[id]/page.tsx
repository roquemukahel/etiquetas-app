'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { registrarAuditoria } from '../../../lib/auditoria';
import { simboloMoneda } from '../../../lib/monedas';
import { sanitizarDecimal } from '../../../lib/numeros';

type Proveedor = { id: string; nombre: string; telefono: string | null };
type Repuesto = { id: string; nombre: string };
type Precio = { id: string; repuesto_id: string; proveedor_id: string; precio: number };

export default function ProveedorRepuestos() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [precios, setPrecios] = useState<Precio[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [precioNuevo, setPrecioNuevo] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [editando, setEditando] = useState<string | null>(null);
  const [valorEditado, setValorEditado] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: rep }, { data: pre }] = await Promise.all([
      supabase.from('proveedores_repuestos').select('id, nombre, telefono').eq('id', id).single(),
      supabase.from('repuestos').select('id, nombre').order('nombre'),
      supabase.from('repuestos_precios').select('id, repuesto_id, proveedor_id, precio'),
    ]);
    setProveedor((prov as Proveedor) ?? null);
    setRepuestos((rep as Repuesto[]) ?? []);
    setPrecios((pre as Precio[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      const codigo = (perfil as any)?.negocios?.moneda;
      if (codigo) setMoneda(simboloMoneda(codigo));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const eliminarProveedor = async () => {
    if (!proveedor) return;
    if (!confirm(`¿Eliminar a "${proveedor.nombre}"? También se van a borrar los precios que tenga cargados.`)) return;
    await supabase.from('proveedores_repuestos').delete().eq('id', proveedor.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un proveedor de repuestos (${proveedor.nombre})`,
      entidad: 'repuesto_proveedor',
      entidadId: proveedor.id,
      valorAnterior: { nombre: proveedor.nombre, telefono: proveedor.telefono },
    });
    window.location.href = '/servicio-tecnico/repuestos';
  };

  const nombreRepuestoDe = (repuestoId: string) => repuestos.find((r) => r.id === repuestoId)?.nombre ?? 'Repuesto eliminado';

  const minimoPorRepuesto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of precios) {
      const actual = mapa.get(p.repuesto_id);
      if (actual === undefined || p.precio < actual) mapa.set(p.repuesto_id, p.precio);
    }
    return mapa;
  }, [precios]);

  const preciosDeEsteProveedor = useMemo(
    () =>
      precios
        .filter((p) => p.proveedor_id === id)
        .sort((a, b) => nombreRepuestoDe(a.repuesto_id).localeCompare(nombreRepuestoDe(b.repuesto_id))),
    [precios, id, repuestos]
  );

  const agregarPrecio = async () => {
    if (!nombreNuevo.trim() || !precioNuevo) return;
    setGuardandoNuevo(true);

    let repuestoId = repuestos.find((r) => r.nombre.toLowerCase() === nombreNuevo.trim().toLowerCase())?.id;
    if (!repuestoId) {
      const { data: nuevoRepuesto } = await supabase
        .from('repuestos')
        .insert({ nombre: nombreNuevo.trim() })
        .select('id')
        .single();
      repuestoId = nuevoRepuesto?.id;
    }
    if (!repuestoId) {
      setGuardandoNuevo(false);
      return;
    }

    await supabase
      .from('repuestos_precios')
      .upsert(
        { repuesto_id: repuestoId, proveedor_id: id, precio: Number(precioNuevo), actualizado_at: new Date().toISOString() },
        { onConflict: 'repuesto_id,proveedor_id' }
      );

    setNombreNuevo('');
    setPrecioNuevo('');
    setGuardandoNuevo(false);
    cargar();
  };

  const abrirEdicion = (p: Precio) => {
    setEditando(p.id);
    setValorEditado(String(p.precio));
  };

  const guardarEdicion = async (p: Precio) => {
    if (!valorEditado) return;
    setGuardandoEdicion(true);
    await supabase
      .from('repuestos_precios')
      .update({ precio: Number(valorEditado), actualizado_at: new Date().toISOString() })
      .eq('id', p.id);
    setEditando(null);
    setGuardandoEdicion(false);
    cargar();
  };

  const eliminarPrecio = async (precioId: string) => {
    if (!confirm('¿Eliminar este repuesto de la lista de este proveedor?')) return;
    const precio = precios.find((p) => p.id === precioId);
    await supabase.from('repuestos_precios').delete().eq('id', precioId);
    await registrarAuditoria(supabase, {
      accion: `eliminó un precio de repuesto de un proveedor (${precio ? nombreRepuestoDe(precio.repuesto_id) : 'sin nombre'})`,
      entidad: 'repuesto_precio',
      entidadId: precioId,
      valorAnterior: precio ? { repuesto_id: precio.repuesto_id, precio: precio.precio } : null,
    });
    cargar();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!proveedor) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos este proveedor.</p>
        <Link href="/servicio-tecnico/repuestos" className="text-sm text-accent dark:text-dark-accent underline">
          Volver
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico/repuestos" className="text-2xl leading-none">
          &larr;
        </Link>
        <div className="min-w-0 mr-auto">
          <p className="text-lg font-medium truncate">{proveedor.nombre}</p>
          {proveedor.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{proveedor.telefono}</p>}
        </div>
        <button onClick={eliminarProveedor} className="text-xs text-bad underline shrink-0">
          Eliminar proveedor
        </button>
      </header>

      {preciosDeEsteProveedor.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">
          Todavía no cargaste repuestos para este proveedor.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {preciosDeEsteProveedor.map((p) => {
          const esMejorPrecio = minimoPorRepuesto.get(p.repuesto_id) === p.precio;
          return (
            <div
              key={p.id}
              className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-2 ${
                esMejorPrecio
                  ? 'bg-good/10 border-good/30'
                  : 'bg-white dark:bg-dark-surface border-border dark:border-dark-border shadow-card'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {esMejorPrecio && <span className="text-xs shrink-0">✅</span>}
                <span className="text-sm truncate">{nombreRepuestoDe(p.repuesto_id)}</span>
              </span>

              {editando === p.id ? (
                <span className="flex items-center gap-1.5 shrink-0">
                  <input
                    value={valorEditado}
                    onChange={(e) => setValorEditado(e.target.value)}
                    inputMode="numeric"
                    autoFocus
                    className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                  />
                  <button
                    disabled={guardandoEdicion}
                    onClick={() => guardarEdicion(p)}
                    className="text-xs text-accent dark:text-dark-accent underline"
                  >
                    Guardar
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => abrirEdicion(p)}
                    className={`font-medium tabular-nums underline decoration-dotted underline-offset-4 ${
                      esMejorPrecio ? 'text-good' : ''
                    }`}
                  >
                    {moneda}
                    {p.precio.toLocaleString('es-AR')}
                  </button>
                  <button onClick={() => eliminarPrecio(p.id)} className="text-xs text-bad underline">
                    Eliminar
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
        <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Agregar repuesto</p>
        <div className="flex gap-2">
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre (ej. Batería iPhone 13)"
            list="catalogo-repuestos"
            className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <datalist id="catalogo-repuestos">
            {repuestos.map((r) => (
              <option key={r.id} value={r.nombre} />
            ))}
          </datalist>
          <input
            value={precioNuevo}
            onChange={(e) => setPrecioNuevo(sanitizarDecimal(e.target.value))}
            placeholder="Precio"
            inputMode="decimal"
            className="w-24 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={!nombreNuevo.trim() || !precioNuevo || guardandoNuevo}
          onClick={agregarPrecio}
          className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          + Agregar
        </button>
      </div>
    </main>
  );
}
