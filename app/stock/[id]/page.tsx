'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { asegurarProveedor } from '../../lib/proveedores';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import SelectorColorAuto from '../../SelectorColorAuto';
import { sanitizarDecimal } from '../../lib/numeros';
import { limpiarImei } from '../../lib/imei';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  numero_serie: string | null;
  salud_bateria: number | null;
  color: string | null;
  precio: number | null;
  costo: number | null;
  proveedor: string | null;
  estado: string | null;
  detalles: string | null;
  en_stock: boolean;
  garantia_vencimiento: string | null;
  agregado_por_nombre: string | null;
  mostrar_en_stock_publico: boolean;
};

export default function DetalleDispositivo() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeRecibirServicioTecnico = tienePermiso(actor, 'recibir_servicio_tecnico');
  // Costo, proveedor y margen son datos sensibles del dueño — mismo permiso
  // que ya usa la pantalla de Stock para la tarjeta de capital. Esto es
  // ocultamiento del lado del cliente nada más (no hay una restricción a
  // nivel de fila/columna en la base para esto todavía); documentado acá
  // porque el pedido original pide reforzarlo también del lado del
  // servidor, algo que queda fuera del alcance de este rediseño visual.
  const puedeVerComercial = tienePermiso(actor, 'ver_estadisticas');

  const [d, setD] = useState<Dispositivo | null>(null);
  const [original, setOriginal] = useState<Dispositivo | null>(null);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derivarAbierto, setDerivarAbierto] = useState(false);
  const [derivarDetalles, setDerivarDetalles] = useState('');
  const [derivando, setDerivando] = useState(false);
  const [zonaPeligroAbierta, setZonaPeligroAbierta] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('dispositivos').select('*').eq('id', id).single();
      setD(data as Dispositivo);
      setOriginal(data as Dispositivo);
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => {
      const { data } = await supabase.from('proveedores').select('nombre').order('nombre');
      setProveedores((data ?? []).map((p) => p.nombre));
    })();
  }, [id]);

  const campo = (k: keyof Dispositivo, valor: any) => setD((prev) => (prev ? { ...prev, [k]: valor } : prev));

  // Objetos chicos y planos (mismos campos siempre, en el mismo orden,
  // porque `original` es literalmente el punto de partida de `d`) — comparar
  // el JSON alcanza para saber si hay algo sin guardar, sin tener que
  // repetir campo por campo.
  const hayCambios = !!d && !!original && JSON.stringify(d) !== JSON.stringify(original);

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      if (!hayCambios) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const volverAtras = (e: React.MouseEvent) => {
    if (hayCambios && !confirm('Tenés cambios sin guardar. ¿Salir igual?')) {
      e.preventDefault();
    }
  };

  const handleGuardar = async () => {
    if (!d || !original) return;
    setGuardando(true);
    setError(null);

    const volvioAStock = !original.en_stock && d.en_stock;
    const proveedorId = await asegurarProveedor(supabase, d.proveedor);

    const { error: updateError } = await supabase
      .from('dispositivos')
      .update({
        modelo: d.modelo?.trim() || null,
        capacidad_gb: d.capacidad_gb,
        imei: limpiarImei(d.imei),
        numero_serie: d.numero_serie?.trim() || null,
        salud_bateria: d.salud_bateria,
        color: d.color?.trim() || null,
        precio: d.precio,
        costo: d.costo,
        proveedor: d.proveedor?.trim() || null,
        proveedor_id: proveedorId,
        detalles: d.detalles?.trim() || null,
        estado: d.estado,
        // Condicional a propósito (como en_stock arriba): si todavía no se
        // corrió la migración de Stock público, esta columna no existe —
        // mandarla igual rompería TODO el guardado de la ficha, no solo
        // este campo.
        ...(d.mostrar_en_stock_publico !== original.mostrar_en_stock_publico
          ? { mostrar_en_stock_publico: d.mostrar_en_stock_publico }
          : {}),
        // Solo se toca en_stock si esta pantalla lo cambió a propósito
        // (tocando el botón de abajo). Si no, se deja como está en la
        // base: si alguien lo vendió desde Órdenes mientras esta pantalla
        // estaba abierta, guardar acá no debe revertir esa venta.
        ...(d.en_stock !== original.en_stock ? { en_stock: d.en_stock } : {}),
        ...(volvioAStock ? { en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false } : {}),
      })
      .eq('id', id);

    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }

    if (original.precio !== d.precio) {
      await registrarAuditoria(supabase, {
        accion: `cambió el precio de ${original.modelo || 'un dispositivo'} de $${original.precio ?? 0} a $${d.precio ?? 0}`,
        entidad: 'dispositivo',
        entidadId: d.id,
        valorAnterior: { precio: original.precio },
        valorNuevo: { precio: d.precio },
      });
    }

    const imeiOriginal = original.imei?.trim() || null;
    const imeiNuevo = d.imei?.trim() || null;
    if (imeiOriginal !== imeiNuevo) {
      await registrarAuditoria(supabase, {
        accion: `cambió el IMEI de ${original.modelo || 'un dispositivo'} de "${imeiOriginal || 'sin IMEI'}" a "${imeiNuevo || 'sin IMEI'}"`,
        entidad: 'dispositivo',
        entidadId: d.id,
        valorAnterior: { imei: imeiOriginal },
        valorNuevo: { imei: imeiNuevo },
      });
    }

    await asegurarModelo(supabase, d.modelo);

    router.push('/stock');
    router.refresh();
  };

  const derivarAServicioTecnico = async () => {
    if (!d || !puedeRecibirServicioTecnico) return;
    setDerivando(true);
    const { data: nueva, error: insertError } = await supabase
      .from('reparaciones')
      .insert({
        modelo: d.modelo,
        capacidad_gb: d.capacidad_gb,
        color: d.color,
        imei: d.imei,
        falla_declarada: derivarDetalles.trim() || null,
        estado: 'recibido',
      })
      .select('id, numero_orden')
      .single();
    // Si esto falla no seguimos: si igual marcáramos el dispositivo fuera de
    // stock, quedaría "perdido" (ni en Stock ni en Servicio Técnico, sin
    // ninguna reparación real que lo respalde).
    if (insertError || !nueva) {
      setError('No pudimos derivar el dispositivo a Servicio Técnico: ' + (insertError?.message ?? 'error desconocido'));
      setDerivando(false);
      return;
    }
    const { error: updateError } = await supabase.from('dispositivos').update({ en_stock: false }).eq('id', d.id);
    if (updateError) {
      setError('Se creó la reparación pero no pudimos sacar el dispositivo de Stock: ' + updateError.message);
    }
    await registrarAuditoria(supabase, {
      accion: `derivó de Stock a Servicio Técnico un dispositivo (${nueva.numero_orden || ''}, ${d.modelo || 'sin modelo'}${d.imei ? `, IMEI ${d.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: nueva.id,
    });
    router.push('/servicio-tecnico');
    router.refresh();
  };

  const handleEliminar = async () => {
    if (!d || !puedeEliminar) return;
    setEliminando(true);
    const { error: deleteError } = await supabase.from('dispositivos').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar: ' + deleteError.message);
      setEliminando(false);
      setConfirmandoEliminar(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó el dispositivo ${d.modelo || 'sin modelo'}${d.imei ? ` (IMEI ${d.imei})` : ''} del historial`,
      entidad: 'dispositivo',
      entidadId: d.id,
    });
    router.push('/stock');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!d) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese dispositivo.</p>
        <Link href="/stock" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al stock
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 pb-24">
      <header className="flex items-center gap-3">
        <Link href="/stock" onClick={volverAtras} className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <div className="min-w-0">
          <p className="text-lg font-medium leading-tight truncate">{d.modelo || 'Dispositivo'}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary font-mono truncate">{d.imei || 'sin IMEI'}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span
            className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
              d.en_stock ? 'bg-good/15 text-good' : 'bg-black/5 dark:bg-white/10 text-muted dark:text-dark-text-secondary'
            }`}
          >
            {d.en_stock ? 'Disponible' : 'Fuera de stock'}
          </span>
          <button type="button" onClick={() => campo('en_stock', !d.en_stock)} className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap">
            Cambiar estado
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {(d.garantia_vencimiento || d.agregado_por_nombre) && (
        <div className="flex flex-col gap-0.5">
          {d.garantia_vencimiento && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              🛡️ Garantía hasta el {new Date(d.garantia_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}
            </p>
          )}
          {d.agregado_por_nombre && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">Agregado por {d.agregado_por_nombre}</p>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Seccion titulo="Identificación">
          <Campo label="Modelo (carpeta)" valor={d.modelo ?? ''} onChange={(v) => campo('modelo', v)} listaId="carpetas-stock" />
          <datalist id="carpetas-stock">
            {carpetas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="IMEI" valor={d.imei ?? ''} onChange={(v) => campo('imei', v)} mono />
            <Campo label="Serie / código (opcional)" valor={d.numero_serie ?? ''} onChange={(v) => campo('numero_serie', v)} mono />
          </div>
        </Seccion>

        <Seccion titulo="Características">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Almacenamiento</label>
            <div className="flex gap-2">
              {STORAGE_OPTIONS.map((gb) => (
                <button
                  key={gb}
                  type="button"
                  onClick={() => campo('capacidad_gb', gb)}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                    d.capacidad_gb === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                  }`}
                >
                  {gb} GB
                </button>
              ))}
            </div>
            {/* Valor libre para equipos que no entran en las 4 capacidades
               típicas de iPhone (ej. 32GB, o directamente otro tipo de
               dispositivo) — no fuerza una opción que no corresponda. */}
            <input
              value={d.capacidad_gb != null && !STORAGE_OPTIONS.includes(d.capacidad_gb) ? String(d.capacidad_gb) : ''}
              onChange={(e) => campo('capacidad_gb', e.target.value ? Number(sanitizarDecimal(e.target.value)) : null)}
              placeholder="Otro valor en GB"
              inputMode="numeric"
              className="mt-2 w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-2.5 text-sm"
            />
          </div>

          <Campo
            label="Salud de batería (%)"
            valor={d.salud_bateria?.toString() ?? ''}
            onChange={(v) => campo('salud_bateria', v ? Number(v) : null)}
            numerico
          />

          <SelectorColorAuto label="Color" modelo={d.modelo} value={d.color ?? ''} onChange={(v) => campo('color', v)} />

          <SelectorEstadoDispositivo value={d.estado ?? 'usado'} onChange={(v) => campo('estado', v)} />
        </Seccion>

        <Seccion titulo="Información comercial">
          {puedeVerComercial ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Precio" valor={d.precio?.toString() ?? ''} onChange={(v) => campo('precio', v ? Number(v) : null)} numerico />
                <Campo
                  label="Costo (opcional)"
                  valor={d.costo?.toString() ?? ''}
                  onChange={(v) => campo('costo', v ? Number(v) : null)}
                  numerico
                />
              </div>
              <Campo label="Proveedor (opcional)" valor={d.proveedor ?? ''} onChange={(v) => campo('proveedor', v)} listaId="proveedores-stock-id" />
              <datalist id="proveedores-stock-id">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          ) : (
            <>
              <Campo label="Precio" valor={d.precio?.toString() ?? ''} onChange={(v) => campo('precio', v ? Number(v) : null)} numerico />
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                Costo y proveedor son visibles solo para quienes pueden ver estadísticas.
              </p>
            </>
          )}
        </Seccion>

        <Seccion titulo="Observaciones y operación">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Detalles del equipo (opcional)</label>
            <textarea
              value={d.detalles ?? ''}
              onChange={(e) => campo('detalles', e.target.value)}
              rows={2}
              placeholder="Ej. módulo con detalle, carcasa con un rayón…"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={d.mostrar_en_stock_publico ?? true}
              onChange={(e) => campo('mostrar_en_stock_publico', e.target.checked)}
              className="h-5 w-5 accent-ink"
            />
            <span className="text-sm">Mostrar en el stock público (si está activado en Configuración)</span>
          </label>

          {d.en_stock && puedeRecibirServicioTecnico && (
            <div className="pt-1 border-t border-border dark:border-dark-border">
              {!derivarAbierto ? (
                <button
                  onClick={() => setDerivarAbierto(true)}
                  className="mt-3 w-full rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-sm font-medium"
                >
                  Derivar a Servicio Técnico
                </button>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">
                    Este dispositivo va a salir de Stock y va a aparecer en Servicio Técnico.
                  </p>
                  <textarea
                    value={derivarDetalles}
                    onChange={(e) => setDerivarDetalles(e.target.value)}
                    placeholder="Detalles (ej. no enciende, pantalla rota)"
                    rows={2}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDerivarAbierto(false)}
                      className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={derivando}
                      onClick={derivarAServicioTecnico}
                      className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {derivando ? 'Derivando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Seccion>
      </div>

      {puedeEliminar && (
        <div className="rounded-2xl border border-bad/25 dark:border-bad/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setZonaPeligroAbierta((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-bad"
          >
            Zona de peligro
            <span className="text-xs">{zonaPeligroAbierta ? '▾' : '▸'}</span>
          </button>
          {zonaPeligroAbierta && (
            <div className="px-4 pb-4 flex flex-col gap-2 border-t border-bad/15 dark:border-bad/20 pt-3">
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                Eliminar este dispositivo lo saca para siempre del historial de Stock. No se puede deshacer.
              </p>
              <button
                onClick={() => setConfirmandoEliminar(true)}
                className="self-start rounded-xl border border-bad/30 px-4 py-2 text-sm font-medium text-bad"
              >
                Eliminar del historial
              </button>
            </div>
          )}
        </div>
      )}

      {confirmandoEliminar && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => !eliminando && setConfirmandoEliminar(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-elevated p-5 flex flex-col gap-3"
          >
            <p className="text-base font-semibold">¿Eliminar este dispositivo?</p>
            <p className="text-sm text-muted dark:text-dark-text-secondary">
              Se borra {d.modelo || 'este equipo'}
              {d.imei ? ` (IMEI ${d.imei})` : ''} del historial de Stock. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                disabled={eliminando}
                onClick={() => setConfirmandoEliminar(false)}
                className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                disabled={eliminando}
                onClick={handleEliminar}
                className="flex-1 rounded-xl bg-bad text-white py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-10 bg-white dark:bg-dark-surface border-t border-border dark:border-dark-border px-6 py-3 flex items-center gap-3">
        {hayCambios && <span className="text-xs text-warn">Cambios sin guardar</span>}
        <button
          disabled={guardando}
          onClick={handleGuardar}
          className="ml-auto rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
  numerico,
  listaId,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(numerico ? sanitizarDecimal(e.target.value) : e.target.value)}
        inputMode={numerico ? 'decimal' : undefined}
        list={listaId}
        className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
