'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { getActor } from '../../../lib/actor';
import { obtenerSucursales, type Sucursal } from '../../../lib/sucursales';
import { obtenerTodasLasFilas } from '../../../lib/db';
import { registrarAuditoria } from '../../../lib/auditoria';
import { useT } from '../../../lib/idioma';

type ProductoOrigen = {
  id: string;
  nombre: string;
  marca: string | null;
  cantidad: number;
  modalidad: string | null;
  sucursal_id: string | null;
};

type ItemRemito = {
  producto_id: string;
  nombre: string;
  marca: string | null;
  disponible: number;
  modalidad: string | null;
  cantidad: number;
};

export default function NuevoRemitoInterno() {
  const supabase = crearClienteNavegador();
  const t = useT();

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [productos, setProductos] = useState<ProductoOrigen[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [items, setItems] = useState<ItemRemito[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remitoCreado, setRemitoCreado] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => {
    (async () => setSucursales(await obtenerSucursales(supabase, false)))();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada vez que se elige la sucursal de origen, se trae el stock puntual de
  // esa sucursal (no de todo el negocio) — son las únicas filas de donde se
  // puede descontar.
  useEffect(() => {
    setItems([]);
    setProductos([]);
    if (!origenId) return;
    setCargandoProductos(true);
    (async () => {
      const data = await obtenerTodasLasFilas<ProductoOrigen>(
        supabase,
        'productos',
        'id, nombre, marca, cantidad, modalidad, sucursal_id',
        [{ columna: 'nombre' }],
        (q) => q.eq('sucursal_id', origenId).gt('cantidad', 0)
      );
      setProductos(data);
      setCargandoProductos(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  const idsEnItems = useMemo(() => new Set(items.map((i) => i.producto_id)), [items]);

  const productosFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return productos
      .filter((p) => !idsEnItems.has(p.id))
      .filter((p) => !q || [p.nombre, p.marca].filter(Boolean).some((c) => c!.toLowerCase().includes(q)));
  }, [productos, buscar, idsEnItems]);

  const agregarItem = (p: ProductoOrigen) => {
    setItems((prev) => [
      ...prev,
      { producto_id: p.id, nombre: p.nombre, marca: p.marca, disponible: p.cantidad, modalidad: p.modalidad, cantidad: p.modalidad === 'serializado' ? 1 : 1 },
    ]);
    setBuscar('');
  };

  const quitarItem = (id: string) => setItems((prev) => prev.filter((i) => i.producto_id !== id));

  const cambiarCantidad = (id: string, cantidad: number) => {
    setItems((prev) => prev.map((i) => (i.producto_id === id ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.disponible)) } : i)));
  };

  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? '';

  const puedeGenerar = origenId && destinoId && origenId !== destinoId && items.length > 0 && !guardando;

  const generarRemito = async () => {
    if (!puedeGenerar) return;
    setGuardando(true);
    setError(null);
    const actor = getActor();
    const { data, error: rpcError } = await supabase.rpc('crear_remito_interno', {
      p_sucursal_origen_id: origenId,
      p_sucursal_destino_id: destinoId,
      p_items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
      p_observaciones: observaciones.trim() || null,
      p_usuario: actor?.nombre ?? null,
    });
    if (rpcError) {
      setError(`${t('No pudimos generar el remito:')} ` + rpcError.message);
      setGuardando(false);
      return;
    }
    const remitoId = data as string;
    const { data: remito } = await supabase.from('remitos_internos').select('numero').eq('id', remitoId).single();
    const numero = (remito as { numero: string } | null)?.numero ?? '';
    await registrarAuditoria(supabase, {
      accion: `Generó el remito interno ${numero} de ${nombreSucursal(origenId)} a ${nombreSucursal(destinoId)} con ${items.length} ítem${items.length === 1 ? '' : 's'}`,
      entidad: 'remito_interno',
      entidadId: remitoId,
    });
    setRemitoCreado({ id: remitoId, numero });
    setGuardando(false);
  };

  if (remitoCreado) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4 items-center text-center">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-semibold">{t('Remito generado')}</h1>
        <p className="text-sm text-muted dark:text-dark-muted">
          {remitoCreado.numero} · {nombreSucursal(origenId)} → {nombreSucursal(destinoId)}
        </p>
        <div className="flex gap-2">
          <Link href="/productos/remitos" className="rounded-lg border border-border dark:border-dark-border px-4 py-2 text-sm font-medium">
            {t('Ver remitos')}
          </Link>
          <Link href="/productos" className="rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-sm font-medium">
            {t('Volver a Productos')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl">
      <header className="flex items-center gap-3">
        <Link href="/productos" className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <h1 className="text-xl font-semibold">{t('Nuevo remito interno')}</h1>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-muted dark:text-dark-muted mb-1">{t('Sucursal origen')}</label>
          <select
            value={origenId}
            onChange={(e) => setOrigenId(e.target.value)}
            className="w-full rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm"
          >
            <option value="">{t('Elegí una sucursal')}</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === destinoId}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted dark:text-dark-muted mb-1">{t('Sucursal destino')}</label>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className="w-full rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm"
          >
            <option value="">{t('Elegí una sucursal')}</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === origenId}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {origenId && (
        <div className="flex flex-col gap-2">
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder={t('Buscar producto en la sucursal de origen...')}
            className="w-full rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {cargandoProductos && <p className="text-xs text-muted dark:text-dark-muted">{t('Cargando...')}</p>}
            {!cargandoProductos && productosFiltrados.length === 0 && (
              <p className="text-xs text-muted dark:text-dark-muted">{t('No hay productos con stock en esa sucursal.')}</p>
            )}
            {productosFiltrados.map((p) => (
              <button
                key={p.id}
                onClick={() => agregarItem(p)}
                className="rounded-lg border border-border dark:border-dark-border px-3 py-2 flex items-center justify-between text-sm text-left"
              >
                <span>
                  {p.nombre} {p.marca ? `· ${p.marca}` : ''}
                </span>
                <span className="text-xs text-muted dark:text-dark-muted shrink-0">{p.cantidad} {t('disp.')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('Ítems del remito')}</h2>
          {items.map((i) => (
            <div key={i.producto_id} className="flex items-center gap-2 rounded-lg border border-border dark:border-dark-border px-3 py-2">
              <span className="flex-1 text-sm truncate">
                {i.nombre} {i.marca ? `· ${i.marca}` : ''}
              </span>
              {i.modalidad === 'serializado' ? (
                <span className="text-xs text-muted dark:text-dark-muted">1 {t('unidad')}</span>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={i.disponible}
                  value={i.cantidad}
                  onChange={(e) => cambiarCantidad(i.producto_id, Number(e.target.value) || 1)}
                  className="w-16 rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-2 py-1 text-sm text-right"
                />
              )}
              <button onClick={() => quitarItem(i.producto_id)} className="text-xs text-bad shrink-0">
                {t('Quitar')}
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder={t('Observaciones (opcional)')}
        rows={2}
        className="w-full rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm resize-none"
      />

      <button
        onClick={generarRemito}
        disabled={!puedeGenerar}
        className="w-full rounded-lg bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
      >
        {guardando ? t('Generando...') : t('Generar remito')}
      </button>
    </main>
  );
}
