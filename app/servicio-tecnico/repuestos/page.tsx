'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';

type Proveedor = { id: string; nombre: string; telefono: string | null };

export default function Repuestos() {
  const supabase = crearClienteNavegador();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);

  const [nombreProveedor, setNombreProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('proveedores_repuestos').select('id, nombre, telefono').order('nombre');
    setProveedores((data as Proveedor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
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
        <span className="text-lg font-medium">Proveedores</span>
      </header>

      <ServicioTecnicoTabs active="proveedores" />

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
    </main>
  );
}
