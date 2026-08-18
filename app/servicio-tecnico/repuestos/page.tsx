'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { simboloMoneda } from '../../lib/monedas';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';

type Proveedor = { id: string; nombre: string; telefono: string | null };
type Repuesto = { id: string; nombre: string };
type Precio = { id: string; repuesto_id: string; proveedor_id: string; precio: number; disponible: boolean; actualizado_at: string };

function antiguedad(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} mes${meses === 1 ? '' : 'es'}`;
}

export default function Repuestos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_servicio_tecnico');

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [precios, setPrecios] = useState<Precio[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'proveedores' | 'comparar'>('proveedores');
  const [busquedaComparar, setBusquedaComparar] = useState('');

  const [nombreProveedor, setNombreProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: rep }, { data: pre }] = await Promise.all([
      supabase.from('proveedores_repuestos').select('id, nombre, telefono').order('nombre'),
      supabase.from('repuestos').select('id, nombre').order('nombre'),
      supabase.from('repuestos_precios').select('id, repuesto_id, proveedor_id, precio, disponible, actualizado_at'),
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
    if (!nombreProveedor.trim() || !puedeGestionar) return;
    setGuardandoProveedor(true);
    const { data: nuevo } = await supabase
      .from('proveedores_repuestos')
      .insert({ nombre: nombreProveedor.trim(), telefono: telefonoProveedor.trim() || null })
      .select('id')
      .single();
    await registrarAuditoria(supabase, {
      accion: `agregó el proveedor de repuestos "${nombreProveedor.trim()}"`,
      entidad: 'repuesto_proveedor',
      entidadId: nuevo?.id,
    });
    setNombreProveedor('');
    setTelefonoProveedor('');
    setGuardandoProveedor(false);
    cargar();
  };

  const nombreProveedorDe = (proveedorId: string) => proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Proveedor eliminado';

  // Agrupa precios por repuesto para poder comparar entre proveedores en
  // una sola fila — solo repuestos que tienen al menos un precio cargado.
  const comparacion = useMemo(() => {
    const porRepuesto = new Map<string, Precio[]>();
    for (const p of precios) {
      const lista = porRepuesto.get(p.repuesto_id) ?? [];
      lista.push(p);
      porRepuesto.set(p.repuesto_id, lista);
    }
    const q = busquedaComparar.trim().toLowerCase();
    return Array.from(porRepuesto.entries())
      .map(([repuestoId, lista]) => {
        const nombre = repuestos.find((r) => r.id === repuestoId)?.nombre ?? 'Repuesto eliminado';
        const ordenados = [...lista].sort((a, b) => {
          if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
          return a.precio - b.precio;
        });
        return { repuestoId, nombre, ordenados };
      })
      .filter((c) => !q || c.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [precios, repuestos, busquedaComparar]);

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
        <Link href="/servicio-tecnico" aria-label="Volver" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Proveedores</span>
      </header>

      <ServicioTecnicoTabs active="proveedores" />

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVista('proveedores')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'proveedores' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border'
          }`}
        >
          Proveedores
        </button>
        <button
          onClick={() => setVista('comparar')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'comparar' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border'
          }`}
        >
          Comparar precios
        </button>
      </div>

      {vista === 'proveedores' ? (
        <>
          <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
            Entrá a cada proveedor para cargar los repuestos y precios que maneja.
          </p>

          {proveedores.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">Todavía no cargaste proveedores.</p>
          )}

          <div className="flex flex-col gap-2">
            {proveedores.map((p) => (
              <Link
                key={p.id}
                href={`/servicio-tecnico/repuestos/${p.id}`}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-2 hover:border-accent/40 dark:hover:border-dark-accent/40 hover:shadow-elevated transition-all active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.nombre}</p>
                  {p.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{p.telefono}</p>}
                </div>
                <span className="text-muted dark:text-dark-text-secondary shrink-0">&rarr;</span>
              </Link>
            ))}
          </div>

          {puedeGestionar && (
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
          )}
        </>
      ) : (
        <>
          <input
            value={busquedaComparar}
            onChange={(e) => setBusquedaComparar(e.target.value)}
            placeholder="Buscar repuesto..."
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-2.5 text-sm"
          />

          {comparacion.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">
              {precios.length === 0 ? 'Todavía no hay precios cargados en ningún proveedor.' : 'No encontramos repuestos con esa búsqueda.'}
            </p>
          )}

          <div className="flex flex-col gap-3">
            {comparacion.map((c) => (
              <div key={c.repuestoId} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-1.5">
                <p className="text-sm font-medium">{c.nombre}</p>
                <div className="flex flex-col gap-1">
                  {c.ordenados.map((p, idx) => (
                    <Link
                      key={p.id}
                      href={`/servicio-tecnico/repuestos/${p.proveedor_id}`}
                      className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 ${
                        idx === 0 && p.disponible ? 'bg-good/10' : 'bg-canvas dark:bg-dark-bg'
                      } ${!p.disponible ? 'opacity-60' : ''}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {idx === 0 && p.disponible && <span>✅</span>}
                        <span className="truncate">{nombreProveedorDe(p.proveedor_id)}</span>
                        {!p.disponible && <span className="text-bad shrink-0">(sin stock)</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-muted dark:text-dark-text-secondary">{antiguedad(p.actualizado_at)}</span>
                        <span className={`font-medium tabular-nums ${idx === 0 && p.disponible ? 'text-good' : ''}`}>
                          {moneda}
                          {p.precio.toLocaleString('es-AR')}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
