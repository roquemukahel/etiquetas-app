'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Proveedor = { id: string; nombre: string; telefono: string | null; detalles: string | null };

export default function Proveedores() {
  const supabase = crearClienteNavegador();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [detallesEdit, setDetallesEdit] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('proveedores').select('*').order('nombre');
    setProveedores((data as Proveedor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('proveedores').insert({ nombre: nombre.trim() });
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
    if (!confirm('¿Eliminar este proveedor? Los dispositivos ya cargados con él no se borran, solo quedan sin proveedor asignado.'))
      return;
    await supabase.from('proveedores').delete().eq('id', id);
    cargar();
  };

  const abrirPerfil = (p: Proveedor) => {
    setEditando(editando === p.id ? null : p.id);
    setNombreEdit(p.nombre);
    setTelefonoEdit(p.telefono ?? '');
    setDetallesEdit(p.detalles ?? '');
    setError(null);
  };

  const guardarPerfil = async (p: Proveedor) => {
    if (!nombreEdit.trim()) {
      setError('El nombre no puede quedar vacío');
      return;
    }
    setGuardandoPerfil(true);
    await supabase
      .from('proveedores')
      .update({
        nombre: nombreEdit.trim(),
        telefono: telefonoEdit.trim() || null,
        detalles: detallesEdit.trim() || null,
      })
      .eq('id', p.id);
    setGuardandoPerfil(false);
    setEditando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Proveedores</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        A quién le comprás stock en lote. Los que ya escribiste al cargar dispositivos también aparecen acá solos.
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del proveedor"
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && proveedores.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no tenés proveedores cargados.</p>
      )}

      <div className="flex flex-col gap-2">
        {proveedores.map((p) => (
          <div key={p.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                {p.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{p.telefono}</p>}
              </div>
              <button onClick={() => abrirPerfil(p)} className="shrink-0 text-xs text-accent dark:text-dark-accent underline">
                {editando === p.id ? 'Cerrar' : 'Editar'}
              </button>
              <button onClick={() => eliminar(p.id)} className="shrink-0 text-xs text-bad underline">
                Eliminar
              </button>
            </div>

            {editando === p.id && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border dark:border-dark-border">
                <input
                  value={nombreEdit}
                  onChange={(e) => setNombreEdit(e.target.value)}
                  placeholder="Nombre"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={telefonoEdit}
                  onChange={(e) => setTelefonoEdit(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={detallesEdit}
                  onChange={(e) => setDetallesEdit(e.target.value)}
                  placeholder="Detalles (opcional)"
                  rows={2}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={guardandoPerfil}
                  onClick={() => guardarPerfil(p)}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
