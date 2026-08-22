'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { compararModelosPorSalida } from '../../lib/catalogosMarcas';
import { normalizarNombreModelo } from '../../lib/modelos';
import { useT } from '../../lib/idioma';

type Carpeta = { id: string; nombre: string; imagen_url: string | null };

export default function Carpetas() {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('modelos_stock').select('*');
    // Mismo orden cronológico que usa la lista principal de Stock (ver
    // app/stock/page.tsx), para no mostrar acá un orden distinto al que el
    // vendedor ya está acostumbrado a buscar.
    const ordenadas = ((data as Carpeta[]) ?? []).sort((a, b) => compararModelosPorSalida(a.nombre, b.nombre));
    setCarpetas(ordenadas);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('modelos_stock').insert({ nombre: nombre.trim() });
    if (insertError) {
      setError(`${t('No pudimos guardar:')} ` + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setGuardando(false);
    cargar();
  };

  const empezarEdicion = (c: Carpeta) => {
    setEditandoId(c.id);
    setNombreEditado(c.nombre);
  };

  const guardarEdicion = async (c: Carpeta) => {
    const nuevoNombre = normalizarNombreModelo(nombreEditado.trim());
    if (!nuevoNombre || nuevoNombre === c.nombre) {
      setEditandoId(null);
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: updateError } = await supabase.from('modelos_stock').update({ nombre: nuevoNombre }).eq('id', c.id);
    if (updateError) {
      setError(`${t('No pudimos renombrar:')} ` + updateError.message);
      setGuardando(false);
      return;
    }
    await supabase.from('dispositivos').update({ modelo: nuevoNombre }).eq('modelo', c.nombre);
    setEditandoId(null);
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm(t('¿Eliminar esta carpeta? Los dispositivos que tenga no se borran, solo dejan de tener carpeta asignada explícitamente.'))) return;
    const carpeta = carpetas.find((c) => c.id === id);
    await supabase.from('modelos_stock').delete().eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `eliminó una carpeta de Stock (${carpeta?.nombre || 'sin nombre'})`,
      entidad: 'carpeta',
      entidadId: id,
      valorAnterior: carpeta ? { nombre: carpeta.nombre } : null,
    });
    cargar();
  };

  const cambiarImagen = (c: Carpeta, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCarpetas((cs) => cs.map((x) => (x.id === c.id ? { ...x, imagen_url: dataUrl } : x)));
      await supabase.from('modelos_stock').update({ imagen_url: dataUrl }).eq('id', c.id);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/stock" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Carpetas de Stock')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('Nombre (ej. iPhone 14)')}
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('Crear')}
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
      {!loading && carpetas.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no creaste ninguna carpeta.')}</p>
      )}

      <div className="flex flex-col gap-2">
        {carpetas.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3"
          >
            <label className="shrink-0 cursor-pointer">
              {c.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imagen_url} alt={c.nombre} className="h-11 w-11 rounded-lg object-cover border border-border dark:border-dark-border" />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-lg">
                  📷
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarImagen(c, e)} />
            </label>

            <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
            {editandoId === c.id ? (
              <input
                value={nombreEditado}
                onChange={(e) => setNombreEditado(e.target.value)}
                autoFocus
                className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <p className="text-sm font-medium">{c.nombre}</p>
            )}

            <div className="flex items-center gap-3 shrink-0">
              {editandoId === c.id ? (
                <button
                  disabled={guardando}
                  onClick={() => guardarEdicion(c)}
                  className="text-xs text-accent dark:text-dark-accent underline disabled:opacity-40"
                >
                  {t('Guardar')}
                </button>
              ) : (
                <button onClick={() => empezarEdicion(c)} className="text-xs text-accent dark:text-dark-accent underline">
                  {t('Renombrar')}
                </button>
              )}
              <button onClick={() => eliminar(c.id)} className="text-xs text-bad underline">
                {t('Eliminar')}
              </button>
            </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
