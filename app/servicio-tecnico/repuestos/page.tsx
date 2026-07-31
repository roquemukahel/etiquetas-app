'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { simboloMoneda } from '../../lib/monedas';

type Proveedor = { id: string; nombre: string; telefono: string | null };
type Repuesto = { id: string; nombre: string };
type Precio = { id: string; repuesto_id: string; proveedor_id: string; precio: number };

export default function Repuestos() {
  const supabase = crearClienteNavegador();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [precios, setPrecios] = useState<Precio[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);

  const [nombreProveedor, setNombreProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  const [nombreRepuesto, setNombreRepuesto] = useState('');
  const [guardandoRepuesto, setGuardandoRepuesto] = useState(false);

  const [panelPrecio, setPanelPrecio] = useState<string | null>(null);
  const [proveedorPrecio, setProveedorPrecio] = useState('');
  const [valorPrecio, setValorPrecio] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: rep }, { data: pre }] = await Promise.all([
      supabase.from('proveedores_repuestos').select('id, nombre, telefono').order('nombre'),
      supabase.from('repuestos').select('id, nombre').order('nombre'),
      supabase.from('repuestos_precios').select('id, repuesto_id, proveedor_id, precio'),
    ]);
    setProveedores((prov as Proveedor[]) ?? []);
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
  }, []);

  const agregarProveedor = async () => {
    if (!nombreProveedor.trim()) return;
    setGuardandoProveedor(true);
    await supabase
      .from('proveedores_repuestos')
      .insert({ nombre: nombreProveedor.trim(), telefono: telefonoProveedor.trim() || null });
    setNombreProveedor('');
    setTelefonoProveedor('');
    setGuardandoProveedor(false);
    cargar();
  };

  const eliminarProveedor = async (p: Proveedor) => {
    if (!confirm(`¿Eliminar a "${p.nombre}"? También se van a borrar los precios que tenga cargados.`)) return;
    await supabase.from('proveedores_repuestos').delete().eq('id', p.id);
    cargar();
  };

  const agregarRepuesto = async () => {
    if (!nombreRepuesto.trim()) return;
    setGuardandoRepuesto(true);
    await supabase.from('repuestos').insert({ nombre: nombreRepuesto.trim() });
    setNombreRepuesto('');
    setGuardandoRepuesto(false);
    cargar();
  };

  const eliminarRepuesto = async (r: Repuesto) => {
    if (!confirm(`¿Eliminar "${r.nombre}" del catálogo de repuestos?`)) return;
    await supabase.from('repuestos').delete().eq('id', r.id);
    cargar();
  };

  const abrirPanelPrecio = (repuestoId: string) => {
    setPanelPrecio(panelPrecio === repuestoId ? null : repuestoId);
    setProveedorPrecio('');
    setValorPrecio('');
  };

  const guardarPrecio = async (repuestoId: string) => {
    if (!proveedorPrecio || !valorPrecio) return;
    setGuardandoPrecio(true);
    await supabase
      .from('repuestos_precios')
      .upsert(
        { repuesto_id: repuestoId, proveedor_id: proveedorPrecio, precio: Number(valorPrecio), actualizado_at: new Date().toISOString() },
        { onConflict: 'repuesto_id,proveedor_id' }
      );
    setPanelPrecio(null);
    setGuardandoPrecio(false);
    cargar();
  };

  const eliminarPrecio = async (precioId: string) => {
    await supabase.from('repuestos_precios').delete().eq('id', precioId);
    cargar();
  };

  const nombreProveedorDe = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? 'Proveedor eliminado';

  const preciosPorRepuesto = useMemo(() => {
    const mapa = new Map<string, Precio[]>();
    for (const p of precios) {
      const lista = mapa.get(p.repuesto_id) ?? [];
      lista.push(p);
      mapa.set(p.repuesto_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.precio - b.precio);
    return mapa;
  }, [precios]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Repuestos y proveedores</span>
      </header>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Proveedores</p>

        {proveedores.length > 0 && (
          <div className="flex flex-col gap-2">
            {proveedores.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.nombre}</p>
                  {p.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{p.telefono}</p>}
                </div>
                <button onClick={() => eliminarProveedor(p)} className="shrink-0 text-xs text-bad underline">
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={nombreProveedor}
              onChange={(e) => setNombreProveedor(e.target.value)}
              placeholder="Nombre del proveedor"
              className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={telefonoProveedor}
              onChange={(e) => setTelefonoProveedor(e.target.value)}
              placeholder="Teléfono (opcional)"
              className="w-32 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            disabled={!nombreProveedor.trim() || guardandoProveedor}
            onClick={agregarProveedor}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            + Agregar proveedor
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Repuestos</p>

        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex gap-2">
          <input
            value={nombreRepuesto}
            onChange={(e) => setNombreRepuesto(e.target.value)}
            placeholder="Nombre del repuesto (ej. Batería iPhone 13)"
            className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={!nombreRepuesto.trim() || guardandoRepuesto}
            onClick={agregarRepuesto}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 px-4 text-sm font-medium text-white disabled:opacity-40 shrink-0"
          >
            Agregar
          </button>
        </div>

        {repuestos.length === 0 && (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">Todavía no cargaste repuestos.</p>
        )}

        <div className="flex flex-col gap-2">
          {repuestos.map((r) => {
            const listaPrecios = preciosPorRepuesto.get(r.id) ?? [];
            const disponibles = proveedores.filter((p) => !listaPrecios.some((pr) => pr.proveedor_id === p.id));

            return (
              <div key={r.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{r.nombre}</p>
                  <button onClick={() => eliminarRepuesto(r)} className="text-xs text-bad underline shrink-0">
                    Eliminar
                  </button>
                </div>

                {listaPrecios.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {listaPrecios.map((pr, i) => (
                      <div
                        key={pr.id}
                        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                          i === 0
                            ? 'bg-good/10 border border-good/30'
                            : 'bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {i === 0 && <span className="text-xs shrink-0">✅</span>}
                          <span className="truncate">{nombreProveedorDe(pr.proveedor_id)}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`font-medium tabular-nums ${i === 0 ? 'text-good' : ''}`}>
                            {moneda}
                            {pr.precio.toLocaleString('es-AR')}
                          </span>
                          <button onClick={() => eliminarPrecio(pr.id)} className="text-xs text-bad underline">
                            &times;
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {panelPrecio === r.id ? (
                  <div className="rounded-lg border border-border dark:border-dark-border p-3 flex flex-col gap-2">
                    {disponibles.length === 0 ? (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">
                        Ya cargaste el precio de todos los proveedores para este repuesto.
                      </p>
                    ) : (
                      <>
                        <select
                          value={proveedorPrecio}
                          onChange={(e) => setProveedorPrecio(e.target.value)}
                          className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">Elegir proveedor...</option>
                          {disponibles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                        <input
                          value={valorPrecio}
                          onChange={(e) => setValorPrecio(e.target.value)}
                          placeholder="Precio"
                          inputMode="numeric"
                          className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        />
                        <button
                          disabled={!proveedorPrecio || !valorPrecio || guardandoPrecio}
                          onClick={() => guardarPrecio(r.id)}
                          className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                          Guardar precio
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => abrirPanelPrecio(r.id)}
                    className="rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium"
                  >
                    + Agregar precio de proveedor
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
