'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import { sanitizarDecimal } from '../../lib/numeros';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';

type Repuesto = { id: string; nombre: string; cantidad_stock: number; costo_unitario: number | null };

export default function StockRepuestos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'agregar_stock');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [cantidadNueva, setCantidadNueva] = useState('');
  const [costoNuevo, setCostoNuevo] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [valorCantidad, setValorCantidad] = useState('');
  const [valorCosto, setValorCosto] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from('repuestos')
      .select('id, nombre, cantidad_stock, costo_unitario')
      .order('nombre');
    setRepuestos((data as Repuesto[]) ?? []);
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
  }, []);

  const filtrados = repuestos.filter((r) => r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const capitalRepuestos = repuestos.reduce((acc, r) => acc + (r.costo_unitario ?? 0) * r.cantidad_stock, 0);
  const hayCostosSinCargar = repuestos.some((r) => r.cantidad_stock > 0 && r.costo_unitario == null);

  const agregarRepuesto = async () => {
    if (!nombreNuevo.trim() || !puedeGestionar) return;
    setGuardandoNuevo(true);
    setError(null);
    // Si ya existe un repuesto con ese nombre, sumamos a su stock en vez de
    // crear un duplicado — es lo que va a esperar alguien que escribe
    // "Batería iPhone 13" dos veces sin darse cuenta.
    const existente = repuestos.find((r) => r.nombre.trim().toLowerCase() === nombreNuevo.trim().toLowerCase());
    if (existente) {
      const cambios = {
        cantidad_stock: existente.cantidad_stock + (Number(cantidadNueva) || 0),
        costo_unitario: costoNuevo ? Number(costoNuevo) : existente.costo_unitario,
      };
      const { error: updError } = await supabase.from('repuestos').update(cambios).eq('id', existente.id);
      if (updError) {
        setError('No pudimos guardar: ' + updError.message);
        setGuardandoNuevo(false);
        return;
      }
    } else {
      const { error: insError } = await supabase.from('repuestos').insert({
        nombre: nombreNuevo.trim(),
        cantidad_stock: Number(cantidadNueva) || 0,
        costo_unitario: costoNuevo ? Number(costoNuevo) : null,
      });
      if (insError) {
        setError('No pudimos guardar: ' + insError.message);
        setGuardandoNuevo(false);
        return;
      }
    }
    setNombreNuevo('');
    setCantidadNueva('');
    setCostoNuevo('');
    setGuardandoNuevo(false);
    cargar();
  };

  const abrirEdicion = (r: Repuesto) => {
    const abrir = editando !== r.id;
    setEditando(abrir ? r.id : null);
    if (abrir) {
      setValorCantidad(String(r.cantidad_stock));
      setValorCosto(r.costo_unitario != null ? String(r.costo_unitario) : '');
    }
  };

  const guardarEdicion = async (r: Repuesto) => {
    const nuevaCantidad = Number(valorCantidad) || 0;
    const nuevoCosto = valorCosto ? Number(valorCosto) : null;
    setGuardandoEdicion(true);
    await supabase.from('repuestos').update({ cantidad_stock: nuevaCantidad, costo_unitario: nuevoCosto }).eq('id', r.id);
    if (nuevaCantidad !== r.cantidad_stock || nuevoCosto !== r.costo_unitario) {
      await registrarAuditoria(supabase, {
        accion: `editó el stock del repuesto "${r.nombre}"`,
        entidad: 'repuesto',
        entidadId: r.id,
        valorAnterior: { cantidad_stock: r.cantidad_stock, costo_unitario: r.costo_unitario },
        valorNuevo: { cantidad_stock: nuevaCantidad, costo_unitario: nuevoCosto },
      });
    }
    setGuardandoEdicion(false);
    setEditando(null);
    cargar();
  };

  const eliminarRepuesto = async (r: Repuesto) => {
    if (!puedeEliminar) return;
    if (!confirm(`¿Eliminar "${r.nombre}" del catálogo de repuestos? No se puede deshacer.`)) return;
    await supabase.from('repuestos').delete().eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó el repuesto "${r.nombre}" del catálogo`,
      entidad: 'repuesto',
      entidadId: r.id,
      valorAnterior: { nombre: r.nombre, cantidad_stock: r.cantidad_stock, costo_unitario: r.costo_unitario },
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

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Stock de repuestos</span>
      </header>

      <ServicioTecnicoTabs active="repuestos" />

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        Baterías, pantallas, entradas de carga y demás — cuánto tenés y cuánto te costó, para poder cargarlo en cada
        reparación y calcular la ganancia real.
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {repuestos.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">
            Capital en repuestos {hayCostosSinCargar && '(parcial)'}
          </p>
          <p className="text-2xl font-display font-semibold leading-tight">
            {moneda}
            {Math.round(capitalRepuestos).toLocaleString('es-AR')}
          </p>
          {hayCostosSinCargar && (
            <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-0.5">
              Hay repuestos con stock sin costo cargado — no entran en esta cuenta.
            </p>
          )}
        </div>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar repuesto..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      {filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">
          {busqueda ? 'No encontramos repuestos con esa búsqueda.' : 'Todavía no cargaste repuestos.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{r.nombre}</p>
              {r.cantidad_stock === 0 && (
                <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5 shrink-0">
                  Sin stock
                </span>
              )}
            </div>

            {editando === r.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
                  Cant.
                  <input
                    value={valorCantidad}
                    onChange={(e) => setValorCantidad(e.target.value.replace(/[^\d-]/g, ''))}
                    inputMode="numeric"
                    autoFocus
                    className="w-16 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
                  Costo c/u
                  <input
                    value={valorCosto}
                    onChange={(e) => setValorCosto(sanitizarDecimal(e.target.value))}
                    inputMode="decimal"
                    placeholder="Sin cargar"
                    className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                  />
                </label>
                <button
                  disabled={guardandoEdicion}
                  onClick={() => guardarEdicion(r)}
                  className="text-xs text-accent dark:text-dark-accent underline disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => puedeGestionar && abrirEdicion(r)}
                  className="text-xs text-muted dark:text-dark-text-secondary underline decoration-dotted"
                >
                  Stock: <span className="font-medium text-ink dark:text-dark-text">{r.cantidad_stock}</span>
                  {r.costo_unitario != null && (
                    <>
                      {' '}
                      · costo c/u {moneda}
                      {r.costo_unitario.toLocaleString('es-AR')}
                    </>
                  )}
                </button>
                {puedeEliminar && (
                  <button onClick={() => eliminarRepuesto(r)} className="text-xs text-bad underline shrink-0">
                    Eliminar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {puedeGestionar && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2 mt-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Agregar repuesto (o sumar stock a uno ya cargado)</p>
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre (ej. Batería iPhone 13)"
            list="catalogo-repuestos-stock"
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <datalist id="catalogo-repuestos-stock">
            {repuestos.map((r) => (
              <option key={r.id} value={r.nombre} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <input
              value={cantidadNueva}
              onChange={(e) => setCantidadNueva(e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="Cantidad"
              inputMode="numeric"
              className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={costoNuevo}
              onChange={(e) => setCostoNuevo(sanitizarDecimal(e.target.value))}
              placeholder="Costo por unidad"
              inputMode="decimal"
              className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            disabled={!nombreNuevo.trim() || guardandoNuevo}
            onClick={agregarRepuesto}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {guardandoNuevo ? 'Guardando...' : '+ Agregar / sumar stock'}
          </button>
        </div>
      )}
    </main>
  );
}
