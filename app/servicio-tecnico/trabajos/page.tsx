'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Trabajo = { id: string; nombre: string; precio: number | null };

export default function Trabajos() {
  const supabase = crearClienteNavegador();
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('trabajos').select('*').order('nombre');
    setTrabajos((data as Trabajo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase
      .from('trabajos')
      .insert({ nombre: nombre.trim(), precio: precio ? Number(precio) : null });
    if (insertError) {
      setError('No pudimos guardar: ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setPrecio('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este trabajo del catálogo?')) return;
    await supabase.from('trabajos').delete().eq('id', id);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Trabajos</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Cambio de pantalla)"
            className="flex-1 bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
          <input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Precio"
            inputMode="numeric"
            className="w-24 bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="w-full rounded-xl bg-accent hover:bg-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Agregar al catálogo
        </button>
      </div>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && trabajos.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">Todavía no cargaste trabajos.</p>
      )}

      <div className="flex flex-col gap-2">
        {trabajos.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-border bg-white shadow-card px-4 py-3 flex items-center justify-between"
          >
            <p className="text-sm font-medium">{t.nombre}</p>
            <div className="flex items-center gap-3">
              {t.precio != null && <p className="text-sm text-muted">${t.precio.toLocaleString('es-AR')}</p>}
              <button onClick={() => eliminar(t.id)} className="text-xs text-bad underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
