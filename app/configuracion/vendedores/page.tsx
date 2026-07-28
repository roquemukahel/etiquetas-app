'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Vendedor = { id: string; nombre: string };

export default function Vendedores() {
  const supabase = crearClienteNavegador();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('vendedores').select('*').order('nombre');
    setVendedores((data as Vendedor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('vendedores').insert({ nombre: nombre.trim() });
    if (insertError) {
      setError('No pudimos guardar: ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este vendedor?')) return;
    await supabase.from('vendedores').delete().eq('id', id);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Vendedores</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del vendedor"
          className="flex-1 bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-ink px-5 text-sm font-medium text-base disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && vendedores.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">Todavía no cargaste vendedores.</p>
      )}

      <div className="flex flex-col gap-2">
        {vendedores.map((v) => (
          <div
            key={v.id}
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between"
          >
            <p className="text-sm font-medium">{v.nombre}</p>
            <button onClick={() => eliminar(v.id)} className="text-xs text-bad underline">
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
