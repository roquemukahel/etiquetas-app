'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Tecnico = { id: string; nombre: string };

type Equipo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  detalles: string | null;
  tecnico_id: string | null;
};

export default function ServicioTecnico() {
  const supabase = crearClienteNavegador();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase
      .from('canjes')
      .select('id, modelo, capacidad_gb, color, detalles, tecnico_id')
      .eq('estado', 'servicio_tecnico')
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
  }, []);

  const asignarTecnico = async (id: string, tecnicoId: string) => {
    setGuardando(id);
    await supabase.from('canjes').update({ tecnico_id: tecnicoId || null }).eq('id', id);
    setEquipos((eq) => eq.map((e) => (e.id === id ? { ...e, tecnico_id: tecnicoId || null } : e)));
    setGuardando(null);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Servicio Técnico</span>
      </header>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && equipos.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">
          No hay equipos derivados a Servicio Técnico. Se envían desde Plan Canje.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {equipos.map((e) => (
          <div key={e.id} className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex flex-col gap-2">
            <p className="text-sm font-medium">
              {e.modelo}
              {e.capacidad_gb ? ` · ${e.capacidad_gb}GB` : ''}
              {e.color ? ` · ${e.color}` : ''}
            </p>
            {e.detalles && <p className="text-xs text-muted">Detalles: {e.detalles}</p>}

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
          </div>
        ))}
      </div>
    </main>
  );
}
