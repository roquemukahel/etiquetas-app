'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
};

export default function Clientes() {
  const supabase = crearClienteNavegador();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true });
      setClientes((data as Cliente[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.email, c.telefono, c.dni]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q))
    );
  }, [clientes, busqueda]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Clientes</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, email, teléfono, DNI..."
        className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
      />

      <Link
        href="/clientes/nuevo"
        className="w-full rounded-2xl border border-black/15 py-3 text-center text-sm font-medium"
      >
        + Cargar cliente
      </Link>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}

      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">
          {busqueda ? 'No encontramos nada con esa búsqueda.' : 'Todavía no tenés clientes cargados.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => (
          <Link
            key={c.id}
            href={`/clientes/${c.id}`}
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {c.nombre} {c.apellido || ''}
              </p>
              <p className="text-xs text-muted">{c.telefono || c.email || 'sin contacto'}</p>
            </div>
            {c.dni && <p className="text-xs text-muted font-mono">{c.dni}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
