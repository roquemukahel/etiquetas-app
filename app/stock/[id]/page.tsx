'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';

const STORAGE_OPTIONS = [64, 128, 256, 512];
const ESTADOS = ['usado', 'sellado'];

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
};

export default function DetalleDispositivo() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [d, setD] = useState<Dispositivo | null>(null);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('dispositivos').select('*').eq('id', id).single();
      setD(data as Dispositivo);
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
  }, [id]);

  const campo = (k: keyof Dispositivo, valor: any) => setD((prev) => (prev ? { ...prev, [k]: valor } : prev));

  const handleGuardar = async () => {
    if (!d) return;
    setGuardando(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('dispositivos')
      .update({
        modelo: d.modelo?.trim() || null,
        capacidad_gb: d.capacidad_gb,
        imei: d.imei?.trim() || null,
        numero_serie: d.numero_serie?.trim() || null,
        salud_bateria: d.salud_bateria,
        color: d.color?.trim() || null,
        precio: d.precio,
        estado: d.estado,
        en_stock: d.en_stock,
      })
      .eq('id', id);

    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }

    await asegurarModelo(supabase, d.modelo);

    router.push('/stock');
    router.refresh();
  };

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar este dispositivo del historial? No se puede deshacer.')) return;
    setGuardando(true);
    const { error: deleteError } = await supabase.from('dispositivos').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    router.push('/stock');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!d) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese dispositivo.</p>
        <Link href="/stock" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al stock
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/stock" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{d.modelo || 'Dispositivo'}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={() => campo('en_stock', !d.en_stock)}
        className={`w-full rounded-xl py-3 text-sm font-medium ${
          d.en_stock ? 'bg-good/15 text-good' : 'bg-black/5 text-muted dark:text-dark-text-secondary'
        }`}
      >
        {d.en_stock ? '✓ En stock — tocá para marcar fuera de stock' : 'Fuera de stock — tocá para volver a stock'}
      </button>

      <div className="flex flex-col gap-3">
        <Campo label="Modelo (carpeta)" valor={d.modelo ?? ''} onChange={(v) => campo('modelo', v)} listaId="carpetas-stock" />
        <datalist id="carpetas-stock">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Almacenamiento</label>
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                type="button"
                onClick={() => campo('capacidad_gb', gb)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  d.capacidad_gb === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {gb} GB
              </button>
            ))}
          </div>
        </div>

        <Campo label="IMEI" valor={d.imei ?? ''} onChange={(v) => campo('imei', v)} mono />
        <Campo
          label="Salud de batería (%)"
          valor={d.salud_bateria?.toString() ?? ''}
          onChange={(v) => campo('salud_bateria', v ? Number(v) : null)}
          numerico
        />
        <Campo label="Color" valor={d.color ?? ''} onChange={(v) => campo('color', v)} />
        <Campo
          label="Precio"
          valor={d.precio?.toString() ?? ''}
          onChange={(v) => campo('precio', v ? Number(v) : null)}
          numerico
        />

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Estado</label>
          <div className="flex gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => campo('estado', e)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                  d.estado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
      <button
        disabled={guardando}
        onClick={handleEliminar}
        className="w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
      >
        Eliminar del historial
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
  numerico,
  listaId,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numerico ? 'numeric' : undefined}
        list={listaId}
        className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
