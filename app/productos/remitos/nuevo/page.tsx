'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { getActor, useActor } from '../../../lib/actor';
import { tienePermiso } from '../../../lib/permisos';
import { obtenerSucursales, type Sucursal } from '../../../lib/sucursales';
import { obtenerTodasLasFilas } from '../../../lib/db';
import { registrarAuditoria } from '../../../lib/auditoria';
import { useT } from '../../../lib/idioma';
import { marcaDeModelo } from '../../../lib/catalogosMarcas';

type Tipo = 'producto' | 'dispositivo';

// Unifica productos (accesorios) y dispositivos (celulares) en una sola
// forma para el picker — un celular siempre se comporta como "serializado"
// (disponible=1, no se puede elegir cantidad, se transfiere la unidad tal
// cual, nunca se descuenta/acredita como stock por cantidad).
type ItemOrigen = {
  id: string;
  tipo: Tipo;
  nombre: string;
  marca: string | null;
  disponible: number;
  modalidad: string | null;
};

type ItemRemito = ItemOrigen & { cantidad: number };

export default function NuevoRemitoInterno() {
  const supabase = crearClienteNavegador();
  const t = useT();
  const actor = useActor();
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [itemsOrigen, setItemsOrigen] = useState<ItemOrigen[]>([]);
  const [cargandoItems, setCargandoItems] = useState(false);
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
  // puede descontar. Junta accesorios (productos) y celulares (dispositivos)
  // en una sola lista para el picker: para el dueño ambos son "productos"
  // que se pueden transferir, aunque vivan en tablas distintas.
  useEffect(() => {
    setItems([]);
    setItemsOrigen([]);
    if (!origenId) return;
    setCargandoItems(true);
    (async () => {
      const [productosData, dispositivosData] = await Promise.all([
        obtenerTodasLasFilas<{ id: string; nombre: string; marca: string | null; cantidad: number; modalidad: string | null }>(
          supabase,
          'productos',
          'id, nombre, marca, cantidad, modalidad, sucursal_id',
          [{ columna: 'nombre' }],
          (q) => q.eq('sucursal_id', origenId).gt('cantidad', 0)
        ),
        obtenerTodasLasFilas<{ id: string; modelo: string | null }>(
          supabase,
          'dispositivos',
          'id, modelo, sucursal_id',
          [{ columna: 'modelo' }],
          (q) => q.eq('sucursal_id', origenId).eq('en_stock', true)
        ),
      ]);
      setItemsOrigen([
        ...productosData.map((p) => ({ id: p.id, tipo: 'producto' as const, nombre: p.nombre, marca: p.marca, disponible: p.cantidad, modalidad: p.modalidad })),
        ...dispositivosData.map((d) => ({
          id: d.id,
          tipo: 'dispositivo' as const,
          nombre: d.modelo || 'Sin modelo',
          marca: marcaDeModelo(d.modelo) || null,
          disponible: 1,
          modalidad: 'serializado',
        })),
      ]);
      setCargandoItems(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  const idsEnItems = useMemo(() => new Set(items.map((i) => `${i.tipo}:${i.id}`)), [items]);

  const itemsFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return itemsOrigen
      .filter((p) => !idsEnItems.has(`${p.tipo}:${p.id}`))
      .filter((p) => !q || [p.nombre, p.marca].filter(Boolean).some((c) => c!.toLowerCase().includes(q)));
  }, [itemsOrigen, buscar, idsEnItems]);

  const agregarItem = (p: ItemOrigen) => {
    setItems((prev) => [...prev, { ...p, cantidad: 1 }]);
    setBuscar('');
  };

  const quitarItem = (tipo: Tipo, id: string) => setItems((prev) => prev.filter((i) => !(i.tipo === tipo && i.id === id)));

  const cambiarCantidad = (tipo: Tipo, id: string, cantidad: number) => {
    setItems((prev) => prev.map((i) => (i.tipo === tipo && i.id === id ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.disponible)) } : i)));
  };

  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? '';

  const puedeGenerar =
    puedeAgregarStock && sucursales.length >= 2 && origenId && destinoId && origenId !== destinoId && items.length > 0 && !guardando;

  const generarRemito = async () => {
    if (!puedeGenerar) return;
    setGuardando(true);
    setError(null);
    const actor = getActor();
    const { data, error: rpcError } = await supabase.rpc('crear_remito_interno', {
      p_sucursal_origen_id: origenId,
      p_sucursal_destino_id: destinoId,
      p_items: items.map((i) => ({ tipo: i.tipo, id: i.id, cantidad: i.cantidad })),
      p_observaciones: observaciones.trim() || null,
      p_usuario: actor?.nombre ?? null,
    });
    if (rpcError) {
      // Dos remitos casi simultáneos entre las mismas sucursales pueden
      // pisarse (Postgres lo detecta solo y aborta uno de los dos, sin
      // perder ni mezclar datos) — mensaje legible en vez del error crudo.
      const esConflictoConcurrente = /deadlock/i.test(rpcError.message);
      setError(
        esConflictoConcurrente
          ? t('Otro remito se estaba generando al mismo tiempo entre estas sucursales. Probá de nuevo.')
          : `${t('No pudimos generar el remito:')} ` + rpcError.message
      );
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
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          {remitoCreado.numero} · {nombreSucursal(origenId)} → {nombreSucursal(destinoId)}
        </p>
        <div className="flex gap-2">
          <Link
            href={`/productos/remitos/${remitoCreado.id}`}
            className="rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-sm font-medium"
          >
            {t('Ver e imprimir')}
          </Link>
          <Link href="/productos/remitos" className="rounded-lg border border-border dark:border-dark-border px-4 py-2 text-sm font-medium">
            {t('Ver remitos')}
          </Link>
          <Link href="/productos" className="rounded-lg border border-border dark:border-dark-border px-4 py-2 text-sm font-medium">
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
      {!puedeAgregarStock && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{t('No tenés permiso para gestionar el stock.')}</p>
      )}
      {sucursales.length > 0 && sucursales.length < 2 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2">
          {t('Necesitás al menos 2 sucursales activas para generar un remito interno.')}
        </p>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-muted dark:text-dark-text-secondary mb-1">{t('Sucursal origen')}</label>
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
          <label className="block text-xs text-muted dark:text-dark-text-secondary mb-1">{t('Sucursal destino')}</label>
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
            {cargandoItems && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>}
            {!cargandoItems && itemsFiltrados.length === 0 && (
              <p className="text-xs text-muted dark:text-dark-text-secondary">{t('No hay productos con stock en esa sucursal.')}</p>
            )}
            {itemsFiltrados.map((p) => (
              <button
                key={`${p.tipo}:${p.id}`}
                onClick={() => agregarItem(p)}
                className="rounded-lg border border-border dark:border-dark-border px-3 py-2 flex items-center justify-between text-sm text-left"
              >
                <span>
                  {p.nombre} {p.marca ? `· ${p.marca}` : ''}
                </span>
                <span className="text-xs text-muted dark:text-dark-text-secondary shrink-0">
                  {p.tipo === 'dispositivo' ? t('1 unidad') : `${p.disponible} ${t('disp.')}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('Ítems del remito')}</h2>
          {items.map((i) => (
            <div key={`${i.tipo}:${i.id}`} className="flex items-center gap-2 rounded-lg border border-border dark:border-dark-border px-3 py-2">
              <span className="flex-1 text-sm truncate">
                {i.nombre} {i.marca ? `· ${i.marca}` : ''}
              </span>
              {i.modalidad === 'serializado' ? (
                <span className="text-xs text-muted dark:text-dark-text-secondary">1 {t('unidad')}</span>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={i.disponible}
                  value={i.cantidad}
                  onChange={(e) => cambiarCantidad(i.tipo, i.id, Number(e.target.value) || 1)}
                  className="w-16 rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-2 py-1 text-sm text-right"
                />
              )}
              <button onClick={() => quitarItem(i.tipo, i.id)} className="text-xs text-bad shrink-0">
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
