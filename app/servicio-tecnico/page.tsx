'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo } from '../lib/modelos';

const STORAGE_OPTIONS = [64, 128, 256, 512];

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

  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoDetalles, setNuevoDetalles] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

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
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetasStock((data ?? []).map((m) => m.nombre));
    })();
  }, []);

  const filtrados = useMemo(
    () => equipos.filter((e) => (tab === 'derivados' ? e.estado === 'servicio_tecnico' : e.estado === 'reparado')),
    [equipos, tab]
  );

  const agregarEquipo = async () => {
    if (!nuevoModelo.trim()) return;
    setGuardandoNuevo(true);
    await supabase.from('canjes').insert({
      modelo: nuevoModelo.trim(),
      capacidad_gb: nuevaCapacidad,
      color: nuevoColor.trim() || null,
      detalles: nuevoDetalles.trim() || null,
      estado: 'servicio_tecnico',
    });
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoDetalles('');
    setPanelNuevo(false);
    setGuardandoNuevo(false);
    cargar();
  };

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

  const volverADerivado = async (id: string) => {
    if (!confirm('¿Volver a mandar este equipo a "Derivados a reparación"?')) return;
    setGuardando(id);
    await supabase.from('canjes').update({ estado: 'servicio_tecnico' }).eq('id', id);
    setGuardando(null);
    cargar();
  };

  const agregarAlStock = async (e: Equipo) => {
    if (!confirm('¿Pasar este equipo al Stock como dispositivo disponible para vender?')) return;
    setGuardando(e.id);
    await supabase.from('dispositivos').insert({
      modelo: e.modelo,
      capacidad_gb: e.capacidad_gb,
      color: e.color,
      estado: 'usado',
      en_stock: true,
    });
    await asegurarModelo(supabase, e.modelo);
    await supabase.from('canjes').delete().eq('id', e.id);
    setGuardando(null);
    cargar();
  };

  const nombreTecnico = (tecnicoId: string | null) => tecnicos.find((t) => t.id === tecnicoId)?.nombre;

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
            tab === 'derivados' ? 'bg-accent text-white' : 'bg-white border border-border text-ink'
          }`}
        >
          Derivados a reparación
        </button>
        <button
          onClick={() => setTab('reparados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'reparados' ? 'bg-accent text-white' : 'bg-white border border-border text-ink'
          }`}
        >
          Reparados
        </button>
      </div>

      {tab === 'derivados' && (
        <>
          <button
            onClick={() => setPanelNuevo((v) => !v)}
            className="w-full rounded-xl border border-border py-3 text-center text-sm font-medium"
          >
            {panelNuevo ? 'Cancelar' : '+ Agregar equipo'}
          </button>

          {panelNuevo && (
            <div className="rounded-xl border border-border bg-white shadow-card p-3 flex flex-col gap-2">
              <input
                value={nuevoModelo}
                onChange={(e) => setNuevoModelo(e.target.value)}
                placeholder="Modelo (ej. iPhone 13)"
                list="carpetas-stock-servicio"
                className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="carpetas-stock-servicio">
                {carpetasStock.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="flex gap-2">
                {STORAGE_OPTIONS.map((gb) => (
                  <button
                    key={gb}
                    onClick={() => setNuevaCapacidad(gb)}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      nuevaCapacidad === gb ? 'bg-accent text-white' : 'border border-border'
                    }`}
                  >
                    {gb}GB
                  </button>
                ))}
              </div>
              <input
                value={nuevoColor}
                onChange={(e) => setNuevoColor(e.target.value)}
                placeholder="Color"
                className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={nuevoDetalles}
                onChange={(e) => setNuevoDetalles(e.target.value)}
                placeholder="Detalles (ej. no enciende, pantalla rota)"
                rows={2}
                className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button
                disabled={!nuevoModelo.trim() || guardandoNuevo}
                onClick={agregarEquipo}
                className="rounded-lg bg-accent hover:bg-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoNuevo ? 'Agregando...' : 'Agregar a Servicio Técnico'}
              </button>
            </div>
          )}
        </>
      )}

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">
          {tab === 'derivados'
            ? 'No hay equipos derivados a reparación. Se envían desde Plan Canje o se agregan acá directamente.'
            : 'Todavía no marcaste ningún equipo como reparado.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((e) => (
          <div key={e.id} className="rounded-xl border border-border bg-white shadow-card px-4 py-3 flex flex-col gap-2">
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
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
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

            {tab === 'reparados' && (
              <>
                {nombreTecnico(e.tecnico_id) && (
                  <p className="text-xs text-muted">Reparado por: {nombreTecnico(e.tecnico_id)}</p>
                )}
                {e.trabajos_realizados && e.trabajos_realizados.length > 0 && (
                  <p className="text-xs text-muted">Arreglo realizado: {e.trabajos_realizados.join(', ')}</p>
                )}
              </>
            )}

            {tab === 'derivados' && (
              <button
                onClick={() => abrirPanelReparar(e.id)}
                className="rounded-lg border border-border py-2 text-xs font-medium"
              >
                {panelReparar === e.id ? 'Cancelar' : 'Marcar como reparado'}
              </button>
            )}

            {tab === 'reparados' && (
              <div className="flex gap-2">
                <button
                  disabled={guardando === e.id}
                  onClick={() => volverADerivado(e.id)}
                  className="flex-1 rounded-lg border border-border py-2 text-xs font-medium disabled:opacity-40"
                >
                  Volver a Derivados
                </button>
                <button
                  disabled={guardando === e.id}
                  onClick={() => agregarAlStock(e)}
                  className="flex-1 rounded-lg bg-accent hover:bg-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Agregar al Stock
                </button>
              </div>
            )}

            {panelReparar === e.id && (
              <div className="rounded-lg border border-border bg-white p-3 flex flex-col gap-2">
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
                  className="mt-1 rounded-lg bg-accent hover:bg-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
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
