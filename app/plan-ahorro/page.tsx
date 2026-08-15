'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';

type Plan = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  monto_objetivo: number;
  estado: string;
  pagado: number;
  dispositivo_id: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
};

const TABS: { id: string; label: string }[] = [
  { id: 'activo', label: 'Activos' },
  { id: 'completado', label: 'Completados' },
  { id: 'cancelado', label: 'Cancelados' },
];

export default function PlanAhorro() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeVer = tienePermiso(actor, 'ver_plan_ahorro');
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('activo');
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    const [{ data }, { data: saldosData }] = await Promise.all([
      supabase
        .from('planes_ahorro')
        .select('id, modelo, capacidad_gb, color, monto_objetivo, estado, dispositivo_id, clientes ( nombre, apellido )')
        .order('created_at', { ascending: false }),
      supabase.rpc('saldos_planes_ahorro'),
    ]);
    const pagadoPorId = new Map<string, number>(
      ((saldosData as { plan_id: string; pagado: number }[]) ?? []).map((s) => [s.plan_id, Number(s.pagado) || 0])
    );
    const lista = ((data as any[]) ?? []).map((p) => ({ ...p, pagado: pagadoPorId.get(p.id) ?? 0 }));
    setPlanes(lista as Plan[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return planes.filter((p) => {
      if (p.estado !== tab) return false;
      if (!q) return true;
      const nombreCliente = p.clientes ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim().toLowerCase() : '';
      return nombreCliente.includes(q) || (p.modelo || '').toLowerCase().includes(q);
    });
  }, [planes, tab, busqueda]);

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver Plan de ahorro.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
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
        <span className="text-lg font-medium mr-auto">Plan de ahorro</span>
        <Link
          href="/plan-ahorro/nuevo"
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo plan
        </Link>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        Un cliente va pagando en cuotas hasta juntar el monto de un equipo puntual. Cuando llega al objetivo, se le entrega.
      </p>

      <div className="flex items-center gap-1.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-xl py-2 px-2 font-medium ${
              tab === t.id
                ? 'bg-accent dark:bg-dark-accent text-white'
                : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por cliente o modelo..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">No hay planes en esta categoría.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((p) => {
          const pct = p.monto_objetivo > 0 ? Math.min(100, Math.round((p.pagado / p.monto_objetivo) * 100)) : 0;
          const nombreCliente = p.clientes ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim() : 'Sin cliente';
          return (
            <Link
              key={p.id}
              href={`/plan-ahorro/${p.id}`}
              className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {nombreCliente}
                    {p.dispositivo_id && (
                      <span className="ml-1.5 text-[9px] font-semibold text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-1.5 py-0.5 align-middle">
                        SEÑA
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {p.modelo || 'Sin modelo'}
                    {p.capacidad_gb ? ` · ${p.capacidad_gb}GB` : ''}
                    {p.color ? ` · ${p.color}` : ''}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted dark:text-dark-text-secondary shrink-0">
                  ${Math.round(p.pagado).toLocaleString('es-AR')} / ${Math.round(p.monto_objetivo).toLocaleString('es-AR')}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-canvas dark:bg-dark-bg overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct >= 100 ? 'bg-good' : 'bg-accent dark:bg-dark-accent'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
