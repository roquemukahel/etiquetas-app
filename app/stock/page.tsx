'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  numero_serie: string | null;
  salud_bateria: number | null;
  color: string | null;
  precio: number | null;
  estado: string | null;
  en_stock: boolean;
  created_at: string;
};

export default function Stock() {
  const supabase = crearClienteNavegador();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('dispositivos')
        .select('*')
        .order('modelo', { ascending: true })
        .order('created_at', { ascending: false });
      setDispositivos((data as Dispositivo[]) ?? []);
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return dispositivos.filter((d) => {
      if (!verTodos && !d.en_stock) return false;
      if (!q) return true;
      return [d.modelo, d.imei, d.numero_serie, d.color]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q));
    });
  }, [dispositivos, busqueda, verTodos]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Dispositivo[]>();
    if (!busqueda.trim()) {
      for (const nombre of carpetas) mapa.set(nombre, []);
    }
    for (const d of filtrados) {
      const clave = d.modelo || 'Sin modelo';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(d);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados, carpetas, busqueda]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Stock</span>
        <Link href="/stock/carpetas" className="text-xs text-accent dark:text-dark-accent underline">
          Carpetas
        </Link>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por modelo, IMEI, serie, código..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVerTodos(false)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            !verTodos ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          En stock
        </button>
        <button
          onClick={() => setVerTodos(true)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            verTodos ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Historial completo
        </button>
      </div>

      <div className="flex gap-2">
        <Link
          href="/stock/nuevo"
          className="flex-1 rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          + Cargar a mano
        </Link>
        <Link
          href="/stock/foto"
          className="flex-1 rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          + Cargar con foto
        </Link>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && grupos.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {busqueda ? 'No encontramos nada con esa búsqueda.' : 'Todavía no tenés dispositivos cargados.'}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {grupos.map(([modelo, items]) => (
          <div key={modelo} className="flex flex-col gap-2">
            <p className="text-xs text-muted dark:text-dark-text-secondary font-medium">
              {modelo} · {items.length}
            </p>
            {items.length === 0 && (
              <p className="text-xs text-muted dark:text-dark-text-secondary italic">Carpeta vacía, todavía sin dispositivos.</p>
            )}
            <div className="flex flex-col gap-2">
              {items.map((d) => (
                <Link
                  key={d.id}
                  href={`/stock/${d.id}`}
                  className={`rounded-xl border border-border dark:border-dark-border px-4 py-3 flex items-center justify-between ${
                    d.en_stock ? 'bg-white dark:bg-dark-surface' : 'bg-white/$1 dark:bg-dark-surface opacity-60'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {d.capacidad_gb ? `${d.capacidad_gb} GB` : 'Capacidad s/d'}
                      {d.color ? ` · ${d.color}` : ''}
                      {d.salud_bateria != null ? ` · ${d.salud_bateria}%` : ''}
                    </p>
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{d.imei || 'sin IMEI'}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {d.precio != null && (
                      <p className="text-sm font-medium">${d.precio.toLocaleString('es-AR')}</p>
                    )}
                    <p className="text-xs text-muted dark:text-dark-text-secondary">{d.en_stock ? 'en stock' : 'fuera de stock'}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
