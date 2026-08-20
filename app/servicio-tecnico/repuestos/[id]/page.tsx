'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { registrarAuditoria } from '../../../lib/auditoria';
import { getActor, useActor } from '../../../lib/actor';
import { tienePermiso } from '../../../lib/permisos';
import { simboloMoneda } from '../../../lib/monedas';
import { sanitizarDecimal } from '../../../lib/numeros';
import { codigoLlamada } from '../../../lib/paises';
import { armarLinkWhatsApp, mensajeConsultaProveedor } from '../../../lib/whatsapp';
import { extraerStockInsuficiente } from '../../../lib/repuestos';
import Modal from '../../../Modal';
import { ICONOS } from '../../../Iconos';

type Proveedor = { id: string; nombre: string; telefono: string | null };
type Repuesto = { id: string; nombre: string };
type Precio = {
  id: string;
  repuesto_id: string;
  proveedor_id: string;
  precio: number;
  actualizado_at: string;
  disponible: boolean;
  tiempo_entrega_dias: number | null;
  garantia_dias: number | null;
  observaciones: string | null;
};

type FormState = {
  nombre: string;
  precio: string;
  disponible: boolean;
  tiempo_entrega_dias: string;
  garantia_dias: string;
  observaciones: string;
};

const FORM_VACIO: FormState = { nombre: '', precio: '', disponible: true, tiempo_entrega_dias: '', garantia_dias: '', observaciones: '' };

function antiguedad(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} mes${meses === 1 ? '' : 'es'}`;
}

export default function ProveedorRepuestos() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_servicio_tecnico');
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  // Convertir una oferta en entrada de stock es una acción de inventario —
  // mismo permiso que ya usa Repuestos (agregar_stock), no el de gestionar
  // el catálogo de proveedores.
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [precios, setPrecios] = useState<Precio[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [codigoPais, setCodigoPais] = useState('54');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [agregandoStockPara, setAgregandoStockPara] = useState<Precio | null>(null);
  const [cantidadAStock, setCantidadAStock] = useState('1');
  const [guardandoStock, setGuardandoStock] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: rep }, { data: pre }] = await Promise.all([
      supabase.from('proveedores_repuestos').select('id, nombre, telefono').eq('id', id).single(),
      supabase.from('repuestos').select('id, nombre').order('nombre'),
      supabase
        .from('repuestos_precios')
        .select('id, repuesto_id, proveedor_id, precio, actualizado_at, disponible, tiempo_entrega_dias, garantia_dias, observaciones'),
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
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda, pais )').eq('id', user.id).single();
      const codigo = (perfil as any)?.negocios?.moneda;
      if (codigo) setMoneda(simboloMoneda(codigo));
      setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const eliminarProveedor = async () => {
    if (!proveedor || !puedeEliminar) return;
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
      if (!p.disponible) continue;
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

  const abrirNuevo = () => {
    if (!puedeGestionar) return;
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (p: Precio) => {
    if (!puedeGestionar) return;
    setEditandoId(p.id);
    setForm({
      nombre: nombreRepuestoDe(p.repuesto_id),
      precio: String(p.precio),
      disponible: p.disponible,
      tiempo_entrega_dias: p.tiempo_entrega_dias != null ? String(p.tiempo_entrega_dias) : '',
      garantia_dias: p.garantia_dias != null ? String(p.garantia_dias) : '',
      observaciones: p.observaciones ?? '',
    });
    setError(null);
    setModalAbierto(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.precio || !puedeGestionar) return;
    setGuardando(true);
    setError(null);

    const camposComunes = {
      disponible: form.disponible,
      tiempo_entrega_dias: form.tiempo_entrega_dias ? Number(form.tiempo_entrega_dias) : null,
      garantia_dias: form.garantia_dias ? Number(form.garantia_dias) : null,
      observaciones: form.observaciones.trim() || null,
    };

    if (editandoId) {
      const { error: updError } = await supabase
        .from('repuestos_precios')
        .update({ precio: Number(form.precio), actualizado_at: new Date().toISOString(), ...camposComunes })
        .eq('id', editandoId);
      if (updError) {
        setError('No pudimos guardar: ' + updError.message);
        setGuardando(false);
        return;
      }
      await registrarAuditoria(supabase, {
        accion: `actualizó el precio de "${form.nombre}" para ${proveedor?.nombre ?? 'un proveedor'}`,
        entidad: 'repuesto_precio',
        entidadId: editandoId,
      });
      setGuardando(false);
      setModalAbierto(false);
      cargar();
      return;
    }

    let repuestoId = repuestos.find((r) => r.nombre.toLowerCase() === form.nombre.trim().toLowerCase())?.id;
    if (!repuestoId) {
      const { data: nuevoRepuesto } = await supabase.from('repuestos').insert({ nombre: form.nombre.trim() }).select('id').single();
      repuestoId = nuevoRepuesto?.id;
    }
    if (!repuestoId) {
      setGuardando(false);
      return;
    }

    const { data: precioNuevo, error: upsertError } = await supabase
      .from('repuestos_precios')
      .upsert(
        {
          repuesto_id: repuestoId,
          proveedor_id: id,
          precio: Number(form.precio),
          actualizado_at: new Date().toISOString(),
          ...camposComunes,
        },
        { onConflict: 'repuesto_id,proveedor_id' }
      )
      .select('id')
      .single();
    if (upsertError) {
      setError('No pudimos guardar: ' + upsertError.message);
      setGuardando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cargó el precio de "${form.nombre.trim()}" para ${proveedor?.nombre ?? 'un proveedor'}`,
      entidad: 'repuesto_precio',
      entidadId: precioNuevo?.id,
    });

    setGuardando(false);
    setModalAbierto(false);
    cargar();
  };

  const eliminarPrecio = async (precioId: string) => {
    if (!puedeGestionar) return;
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

  const confirmarAgregarStock = async () => {
    if (!agregandoStockPara || !proveedor || !puedeAgregarStock) return;
    const cantidad = Number(cantidadAStock) || 0;
    if (cantidad <= 0) return;
    setGuardandoStock(true);
    setError(null);
    const actor = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_registrar_movimiento', {
      p_repuesto_id: agregandoStockPara.repuesto_id,
      p_tipo: 'entrada',
      p_cantidad: cantidad,
      p_costo_unitario: agregandoStockPara.precio,
      p_motivo: `Compra a ${proveedor.nombre}`,
      p_actor_nombre: actor?.nombre ?? null,
    });
    if (rpcError) {
      const stockActual = extraerStockInsuficiente(rpcError.message);
      setError(stockActual != null ? 'No pudimos registrar la entrada.' : 'No pudimos registrar la entrada: ' + rpcError.message);
      setGuardandoStock(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `agregó ${cantidad} de "${nombreRepuestoDe(agregandoStockPara.repuesto_id)}" al stock, comprado a ${proveedor.nombre}`,
      entidad: 'repuesto',
      entidadId: agregandoStockPara.repuesto_id,
    });
    setAgregandoStockPara(null);
    setCantidadAStock('1');
    setGuardandoStock(false);
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
        <Link href="/servicio-tecnico/repuestos" aria-label="Volver" className="text-2xl leading-none">
          &larr;
        </Link>
        <div className="min-w-0 mr-auto">
          <p className="text-lg font-medium truncate">{proveedor.nombre}</p>
          {proveedor.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{proveedor.telefono}</p>}
        </div>
        {proveedor.telefono && (
          <a
            href={armarLinkWhatsApp(proveedor.telefono, mensajeConsultaProveedor('un repuesto'), codigoPais)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium"
          >
            WhatsApp
          </a>
        )}
        {puedeEliminar && (
          <button onClick={eliminarProveedor} className="text-xs text-bad underline shrink-0">
            Eliminar
          </button>
        )}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {preciosDeEsteProveedor.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">
          Todavía no cargaste repuestos para este proveedor.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {preciosDeEsteProveedor.map((p) => {
          const esMejorPrecio = p.disponible && minimoPorRepuesto.get(p.repuesto_id) === p.precio;
          return (
            <div
              key={p.id}
              className={`rounded-xl border px-4 py-3 flex flex-col gap-1.5 ${
                esMejorPrecio ? 'bg-good/10 border-good/30' : 'bg-white dark:bg-dark-surface border-border dark:border-dark-border shadow-card'
              } ${!p.disponible ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {esMejorPrecio && (
                    <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0 text-good">
                      {ICONOS.check}
                    </span>
                  )}
                  <span className="text-sm truncate">{nombreRepuestoDe(p.repuesto_id)}</span>
                  {!p.disponible && (
                    <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5 shrink-0">Sin stock</span>
                  )}
                </span>
                {puedeGestionar ? (
                  <button
                    onClick={() => abrirEdicion(p)}
                    className={`font-medium tabular-nums underline decoration-dotted underline-offset-4 shrink-0 ${esMejorPrecio ? 'text-good' : ''}`}
                  >
                    {moneda}
                    {p.precio.toLocaleString('es-AR')}
                  </button>
                ) : (
                  <span className={`font-medium tabular-nums shrink-0 ${esMejorPrecio ? 'text-good' : ''}`}>
                    {moneda}
                    {p.precio.toLocaleString('es-AR')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted dark:text-dark-text-secondary">
                <span>Actualizado {antiguedad(p.actualizado_at)}</span>
                {p.tiempo_entrega_dias != null && <span>· entrega en {p.tiempo_entrega_dias}d</span>}
                {p.garantia_dias != null && <span>· garantía {p.garantia_dias}d</span>}
              </div>
              {p.observaciones && <p className="text-[11px] text-muted dark:text-dark-text-secondary">{p.observaciones}</p>}
              {(puedeAgregarStock || puedeGestionar) && (
                <div className="flex items-center gap-3 mt-0.5">
                  {puedeAgregarStock && (
                    <button
                      onClick={() => {
                        setAgregandoStockPara(p);
                        setCantidadAStock('1');
                      }}
                      className="text-xs text-accent dark:text-dark-accent underline"
                    >
                      + Agregar a stock
                    </button>
                  )}
                  {puedeGestionar && (
                    <button onClick={() => eliminarPrecio(p.id)} className="text-xs text-bad underline">
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {puedeGestionar && (
        <button
          onClick={abrirNuevo}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white"
        >
          + Agregar repuesto
        </button>
      )}

      {modalAbierto && (
        <Modal titulo={editandoId ? 'Editar precio' : 'Agregar repuesto'} onClose={() => setModalAbierto(false)}>
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Repuesto</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Batería iPhone 13"
                list="catalogo-repuestos"
                disabled={!!editandoId}
                autoFocus
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              />
              <datalist id="catalogo-repuestos">
                {repuestos.map((r) => (
                  <option key={r.id} value={r.nombre} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Precio</label>
              <input
                value={form.precio}
                onChange={(e) => setForm((f) => ({ ...f, precio: sanitizarDecimal(e.target.value) }))}
                inputMode="decimal"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Tiempo de entrega (días)</label>
                <input
                  value={form.tiempo_entrega_dias}
                  onChange={(e) => setForm((f) => ({ ...f, tiempo_entrega_dias: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Garantía (días)</label>
                <input
                  value={form.garantia_dias}
                  onChange={(e) => setForm((f) => ({ ...f, garantia_dias: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.disponible}
                onChange={(e) => setForm((f) => ({ ...f, disponible: e.target.checked }))}
                className="h-4 w-4 accent-ink"
              />
              Disponible ahora
            </label>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModalAbierto(false)} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
              Cancelar
            </button>
            <button
              disabled={!form.nombre.trim() || !form.precio || guardando}
              onClick={guardar}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}

      {agregandoStockPara && (
        <Modal titulo="Agregar a stock" onClose={() => setAgregandoStockPara(null)} maxWidth="max-w-sm">
          <p className="text-sm">
            {nombreRepuestoDe(agregandoStockPara.repuesto_id)} — {moneda}
            {agregandoStockPara.precio.toLocaleString('es-AR')} c/u
          </p>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Cantidad comprada</label>
            <input
              value={cantidadAStock}
              onChange={(e) => setCantidadAStock(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoFocus
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary">
            Se suma al stock físico del repuesto con este costo por unidad, y queda en el historial de movimientos.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setAgregandoStockPara(null)} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
              Cancelar
            </button>
            <button
              disabled={!cantidadAStock || guardandoStock}
              onClick={confirmarAgregarStock}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardandoStock ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
