'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { useT } from '../lib/idioma';
import { formatearMonto } from '../lib/numeros';

type Proveedor = { id: string; nombre: string; telefono: string | null; saldo: number };

export default function Proveedores() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeVer = tienePermiso(actor, 'ver_proveedores');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const [{ data }, { data: saldosData }] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, telefono').order('nombre'),
      supabase.rpc('saldos_proveedores'),
    ]);
    const saldoPorId = new Map<string, number>(
      ((saldosData as { proveedor_id: string; saldo: number }[]) ?? []).map((s) => [s.proveedor_id, Number(s.saldo) || 0])
    );
    const lista = ((data as { id: string; nombre: string; telefono: string | null }[]) ?? []).map((p) => ({
      ...p,
      saldo: saldoPorId.get(p.id) ?? 0,
    }));
    setProveedores(lista);
    setLoading(false);
  };

  // Total que le debés a todos los proveedores (solo saldos positivos).
  const totalPorPagar = useMemo(() => proveedores.reduce((acc, p) => acc + Math.max(0, p.saldo), 0), [proveedores]);
  // Total a favor: suma de los saldos negativos (proveedores a los que les
  // pagaste de más), en valor positivo para mostrar.
  const totalAFavor = useMemo(() => proveedores.reduce((acc, p) => acc + Math.max(0, -p.saldo), 0), [proveedores]);

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('proveedores').insert({ nombre: nombre.trim() });
    if (insertError) {
      setError(t('No pudimos guardar:') + ' ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setGuardando(false);
    cargar();
  };

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Proveedores.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Proveedores')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        {t('A quién le comprás stock en lote. Entrá a cada uno para ver las compras y llevar la cuenta de lo que le debés.')}
      </p>

      {(totalPorPagar > 0 || totalAFavor > 0) && (
        <div className={totalPorPagar > 0 && totalAFavor > 0 ? 'grid grid-cols-2 gap-3' : 'flex'}>
          {totalPorPagar > 0 && (
            <div className="flex-1 rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Total por pagar')}</p>
              <p className="text-2xl font-display font-semibold text-bad">${formatearMonto(totalPorPagar)}</p>
            </div>
          )}
          {totalAFavor > 0 && (
            <div className="flex-1 rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Saldo a favor')}</p>
              <p className="text-2xl font-display font-semibold text-good">${formatearMonto(totalAFavor)}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('Nombre del proveedor')}
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('Agregar')}
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
      {!loading && proveedores.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no tenés proveedores cargados.')}</p>
      )}

      <div className="flex flex-col gap-2">
        {proveedores.map((p) => (
          <Link
            key={p.id}
            href={`/proveedores/${p.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">{p.nombre}</p>
              {p.telefono && <p className="text-xs text-muted dark:text-dark-text-secondary">{p.telefono}</p>}
            </div>
            <div className="flex items-center gap-2">
              {p.saldo > 0 ? (
                <span className="text-sm font-medium text-bad">{t('le debés')} ${formatearMonto(p.saldo)}</span>
              ) : p.saldo < 0 ? (
                <span className="text-xs font-medium text-good">{t('saldo a favor')} ${formatearMonto(-p.saldo)}</span>
              ) : null}
              <span className="text-muted dark:text-dark-text-secondary">&rsaquo;</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
