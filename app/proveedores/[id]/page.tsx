'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Proveedor = { id: string; nombre: string; telefono: string | null; detalles: string | null };
type CompraManual = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  cantidad: number;
  precio_unitario: number | null;
  detalles: string | null;
  created_at: string;
};
type DispositivoComprado = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  costo: number | null;
  created_at: string;
};

// Una sola lista para mostrar, mezclando las dos fuentes: lo cargado a
// mano acá (compras_proveedor) y lo que ya quedó vinculado solo al
// agregar un dispositivo al stock con este proveedor (dispositivos.costo).
type FilaCompra = {
  key: string;
  modelo: string | null;
  capacidad_gb: number | null;
  cantidad: number;
  precioUnitario: number | null;
  fecha: string;
  origen: 'manual' | 'stock';
  detalles: string | null;
  idManual: string | null;
};

export default function DetalleProveedor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeVer = tienePermiso(actor, 'ver_proveedores');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [compras, setCompras] = useState<CompraManual[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoComprado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [nombreEdit, setNombreEdit] = useState('');
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [detallesEdit, setDetallesEdit] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [agregandoCompra, setAgregandoCompra] = useState(false);
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [detallesCompra, setDetallesCompra] = useState('');
  const [guardandoCompra, setGuardandoCompra] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: comprasData }, { data: dispData }] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, telefono, detalles').eq('id', id).maybeSingle(),
      supabase
        .from('compras_proveedor')
        .select('id, modelo, capacidad_gb, cantidad, precio_unitario, detalles, created_at')
        .eq('proveedor_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('dispositivos')
        .select('id, modelo, capacidad_gb, costo, created_at')
        .eq('proveedor_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setProveedor((prov as Proveedor) ?? null);
    setCompras((comprasData as CompraManual[]) ?? []);
    setDispositivos((dispData as DispositivoComprado[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puedeVer]);

  const filas: FilaCompra[] = useMemo(() => {
    const deManual: FilaCompra[] = compras.map((c) => ({
      key: `m-${c.id}`,
      modelo: c.modelo,
      capacidad_gb: c.capacidad_gb,
      cantidad: c.cantidad,
      precioUnitario: c.precio_unitario,
      fecha: c.created_at,
      origen: 'manual',
      detalles: c.detalles,
      idManual: c.id,
    }));
    const deStock: FilaCompra[] = dispositivos.map((d) => ({
      key: `s-${d.id}`,
      modelo: d.modelo,
      capacidad_gb: d.capacidad_gb,
      cantidad: 1,
      precioUnitario: d.costo,
      fecha: d.created_at,
      origen: 'stock',
      detalles: null,
      idManual: null,
    }));
    return [...deManual, ...deStock].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [compras, dispositivos]);

  const totalGastado = filas.reduce((acc, f) => acc + (f.precioUnitario || 0) * f.cantidad, 0);
  const totalUnidades = filas.reduce((acc, f) => acc + f.cantidad, 0);

  const abrirEdicionPerfil = () => {
    if (!proveedor) return;
    setNombreEdit(proveedor.nombre);
    setTelefonoEdit(proveedor.telefono ?? '');
    setDetallesEdit(proveedor.detalles ?? '');
    setEditandoPerfil(true);
  };

  const guardarPerfil = async () => {
    if (!proveedor || !nombreEdit.trim()) {
      setError('El nombre no puede quedar vacío');
      return;
    }
    setGuardandoPerfil(true);
    await supabase
      .from('proveedores')
      .update({ nombre: nombreEdit.trim(), telefono: telefonoEdit.trim() || null, detalles: detallesEdit.trim() || null })
      .eq('id', proveedor.id);
    setGuardandoPerfil(false);
    setEditandoPerfil(false);
    cargar();
  };

  const eliminarProveedor = async () => {
    if (!proveedor || !puedeEliminar) return;
    if (
      !confirm(
        `¿Eliminar a "${proveedor.nombre}"? Las compras que le cargaste acá también se borran. Los dispositivos ya agregados al stock con él no se borran, solo quedan sin proveedor asignado.`
      )
    )
      return;
    await supabase.from('proveedores').delete().eq('id', proveedor.id);
    router.push('/proveedores');
  };

  const agregarCompra = async () => {
    if (!proveedor || !modelo.trim()) return;
    setGuardandoCompra(true);
    setError(null);
    const { error: insertError } = await supabase.from('compras_proveedor').insert({
      proveedor_id: proveedor.id,
      modelo: modelo.trim(),
      capacidad_gb: capacidad,
      cantidad: Math.max(1, Number(cantidad) || 1),
      precio_unitario: precioUnitario ? Number(precioUnitario) : null,
      detalles: detallesCompra.trim() || null,
    });
    if (insertError) {
      setError('No pudimos guardar la compra: ' + insertError.message);
      setGuardandoCompra(false);
      return;
    }
    setModelo('');
    setCapacidad(null);
    setCantidad('1');
    setPrecioUnitario('');
    setDetallesCompra('');
    setAgregandoCompra(false);
    setGuardandoCompra(false);
    cargar();
  };

  const eliminarCompra = async (compraId: string) => {
    if (!puedeEliminar) return;
    if (!confirm('¿Eliminar esta compra?')) return;
    await supabase.from('compras_proveedor').delete().eq('id', compraId);
    cargar();
  };

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver Proveedores.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

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
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese proveedor.</p>
        <Link href="/proveedores" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a Proveedores
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/proveedores" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{proveedor.nombre}</span>
        <button onClick={() => (editandoPerfil ? setEditandoPerfil(false) : abrirEdicionPerfil())} className="text-xs text-accent dark:text-dark-accent underline">
          {editandoPerfil ? 'Cerrar' : 'Editar'}
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {editandoPerfil ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <input
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            placeholder="Nombre"
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={telefonoEdit}
            onChange={(e) => setTelefonoEdit(e.target.value)}
            placeholder="Teléfono"
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={detallesEdit}
            onChange={(e) => setDetallesEdit(e.target.value)}
            placeholder="Detalles (opcional)"
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={guardandoPerfil}
            onClick={guardarPerfil}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Guardar
          </button>
          {puedeEliminar && (
            <button onClick={eliminarProveedor} className="rounded-lg border border-bad/30 py-2 text-sm font-medium text-bad">
              Eliminar proveedor
            </button>
          )}
        </div>
      ) : (
        proveedor.telefono || proveedor.detalles ? (
          <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
            {proveedor.telefono && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Teléfono:</span> {proveedor.telefono}
              </p>
            )}
            {proveedor.detalles && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Detalles:</span> {proveedor.detalles}
              </p>
            )}
          </div>
        ) : null
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
          <p className="text-xl font-display font-semibold leading-none">${Math.round(totalGastado).toLocaleString('es-AR')}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">Total comprado</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
          <p className="text-xl font-display font-semibold leading-none">{totalUnidades}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">Unidades compradas</p>
        </div>
      </div>

      {agregandoCompra ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Cargar compra</p>
          <input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Modelo (ej. iPhone 12)"
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                onClick={() => setCapacidad(gb)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                  capacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {gb}GB
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Cantidad</label>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="numeric"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Precio unitario</label>
              <input
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                inputMode="numeric"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            value={detallesCompra}
            onChange={(e) => setDetallesCompra(e.target.value)}
            placeholder="Detalles (opcional)"
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setAgregandoCompra(false)}
              className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              disabled={!modelo.trim() || guardandoCompra}
              onClick={agregarCompra}
              className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardandoCompra ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAgregandoCompra(true)}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          + Cargar compra
        </button>
      )}

      <div className="flex flex-col gap-2">
        {filas.length === 0 && (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">Todavía no hay compras registradas.</p>
        )}
        {filas.map((f) => (
          <div
            key={f.key}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {f.modelo || 'Sin modelo'}
                {f.capacidad_gb ? ` · ${f.capacidad_gb}GB` : ''}
                {f.cantidad > 1 ? ` · x${f.cantidad}` : ''}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {new Date(f.fecha).toLocaleDateString('es-AR')} ·{' '}
                {f.origen === 'stock' ? 'cargado al Stock' : 'compra cargada a mano'}
              </p>
              {f.detalles && <p className="text-xs text-muted dark:text-dark-text-secondary">{f.detalles}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {f.precioUnitario != null && (
                <p className="text-sm font-medium">${(f.precioUnitario * f.cantidad).toLocaleString('es-AR')}</p>
              )}
              {f.origen === 'manual' && f.idManual && puedeEliminar && (
                <button onClick={() => eliminarCompra(f.idManual!)} className="text-xs text-bad underline">
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
