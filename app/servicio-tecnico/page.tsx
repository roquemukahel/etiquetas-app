'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Tecnico = { id: string; nombre: string };
type Trabajo = { id: string; nombre: string };

type Equipo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  detalles: string | null;
  tecnico_id: string | null;
  estado: string;
  trabajos_realizados: string[] | null;
};

export default function ServicioTecnico() {
  const supabase = crearClienteNavegador();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'derivados' | 'reparados'>('derivados');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [panelReparar, setPanelReparar] = useState<string | null>(null);
  const [seleccionTrabajos, setSeleccionTrabajos] = useState<string[]>([]);

  const cargar = async () => {
    const { data } = await supabase
      .from('canjes')
      .select('id, modelo, capacidad_gb, color, detalles, tecnico_id, estado, trabajos_realizados')
      .in('estado', ['servicio_tecnico', 'reparado'])
      .order('created_at', { ascending: false });
    setEquipos((data as Equipo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('tecnicos').select('*').order('nombre');
      setTecnicos((data as Tecnico[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('trabajos').select('id, nombre').order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
  }, []);

  const filtrados = useMemo(
    () => equipos.filter((e) => (tab === 'derivados' ? e.estado === 'servicio_tecnico' : e.estado === 'reparado')),
    [equipos, tab]
  );

  const asignarTecnico = async (id: string, tecnicoId: string) => {
    setGuardando(id);
    await supabase.from('canjes').update({ tecnico_id: tecnicoId || null }).eq('id', id);
    setEquipos((eq) => eq.map((e) => (e.id === id ? { ...e, tecnico_id: tecnicoId || null } : e)));
    setGuardando(null);
  };

  const abrirPanelReparar = (id: string) => {
    setPanelReparar(panelReparar === id ? null : id);
    setSeleccionTrabajos([]);
  };

  const toggleTrabajo = (nombre: string) => {
    setSeleccionTrabajos((sel) => (sel.includes(nombre) ? sel.filter((n) => n !== nombre) : [...sel, nombre]));
  };

  const marcarReparado = async (id: string) => {
    setGuardando(id);
    await supabase.from('canjes').update({ estado: 'reparado', trabajos_realizados: seleccionTrabajos }).eq('id', id);
    setPanelReparar(null);
    setGuardando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Servicio Técnico</span>
        <Link href="/servicio-tecnico/trabajos" className="text-xs text-accent underline">
          Trabajos
        </Link>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setTab('derivados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'derivados' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
          }`}
        >
          Derivados a reparación
        </button>
        <button
          onClick={() => setTab('reparados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'reparados' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
          }`}
        >
          Reparados
        </button>
      </div>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">
          {tab === 'derivados'
            ? 'No hay equipos derivados a reparación. Se envían desde Plan Canje.'
            : 'Todavía no marcaste ningún equipo como reparado.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((e) => (
          <div key={e.id} className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex flex-col gap-2">
            <p className="text-sm font-medium">
              {e.modelo}
              {e.capacidad_gb ? ` · ${e.capacidad_gb}GB` : ''}
              {e.color ? ` · ${e.color}` : ''}
            </p>
            {e.detalles && <p className="text-xs text-muted">Detalles: {e.detalles}</p>}

            {tab === 'derivados' && (
              <div>
                <label className="text-xs text-muted block mb-1">Técnico asignado</label>
                <select
                  value={e.tecnico_id ?? ''}
                  disabled={guardando === e.id}
                  onChange={(ev) => asignarTecnico(e.id, ev.target.value)}
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm disabled:opacity-40"
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tab === 'reparados' && e.trabajos_realizados && e.trabajos_realizados.length > 0 && (
              <p className="text-xs text-muted">Arreglo realizado: {e.trabajos_realizados.join(', ')}</p>
            )}

            {tab === 'derivados' && (
              <button
                onClick={() => abrirPanelReparar(e.id)}
                className="rounded-lg border border-black/15 py-2 text-xs font-medium"
              >
                {panelReparar === e.id ? 'Cancelar' : 'Marcar como reparado'}
              </button>
            )}

            {panelReparar === e.id && (
              <div className="rounded-lg border border-black/10 bg-white p-3 flex flex-col gap-2">
                <p className="text-xs font-medium text-muted">Arreglo realizado</p>
                {trabajos.length === 0 && (
                  <p className="text-xs text-muted">
                    Todavía no cargaste trabajos en el catálogo.{' '}
                    <Link href="/servicio-tecnico/trabajos" className="text-accent underline">
                      Cargar acá
                    </Link>
                  </p>
                )}
                {trabajos.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={seleccionTrabajos.includes(t.nombre)}
                      onChange={() => toggleTrabajo(t.nombre)}
                      className="h-4 w-4 accent-ink"
                    />
                    {t.nombre}
                  </label>
                ))}
                <button
                  disabled={guardando === e.id}
                  onClick={() => marcarReparado(e.id)}
                  className="mt-1 rounded-lg bg-ink py-2 text-xs font-medium text-base disabled:opacity-40"
                >
                  Confirmar reparado
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
