'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerImagenesCarpetas, imagenParaModelo } from '../lib/carpetas';
import MiniaturaDispositivo from '../MiniaturaDispositivo';

type Compra = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  precio: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_stock: 'En stock',
  servicio_tecnico: 'Servicio técnico',
};

export default function Compras() {
  const supabase = crearClienteNavegador();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('compras')
        .select('*, clientes ( nombre, apellido )')
        .order('created_at', { ascending: false });
      setCompras((data as any) ?? []);
      setLoading(false);
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return compras;
    return compras.filter((c) =>
      [c.modelo, c.clientes?.nombre, c.clientes?.apellido].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [compras, busqueda]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Compra de dispositivos</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por modelo o cliente..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <Link
        href="/compras/nueva"
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        + Nueva compra
      </Link>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && filtradas.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">No hay compras para mostrar.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((c) => (
          <Link
            key={c.id}
            href={`/compras/${c.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3"
          >
            <MiniaturaDispositivo src={imagenParaModelo(c.modelo, imagenesCarpetas)} />
            <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <div>
              <p className="text-sm font-medium">
                {c.modelo}
                {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
              </p>
              {c.imei && (
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                </p>
              )}
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {c.clientes ? `${c.clientes.nombre} ${c.clientes.apellido || ''}` : 'Sin cliente'}
              </p>
            </div>
            <div className="text-right">
              {c.precio != null && <p className="text-sm font-medium">${c.precio.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted dark:text-dark-text-secondary">{ETIQUETA_ESTADO[c.estado] || c.estado}</p>
            </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
