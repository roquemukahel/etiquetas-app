'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Negocio = {
  id: string;
  nombre: string;
  activo: boolean;
  creado: string;
  cantidad_usuarios: number;
  cantidad_dispositivos: number;
  cantidad_ordenes: number;
  ultima_actividad: string;
};

type Usuario = { email: string; creado: string };

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR');
}

function diasInactivo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminPanel() {
  const supabase = crearClienteNavegador();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [usuariosPorNegocio, setUsuariosPorNegocio] = useState<Record<string, Usuario[]>>({});

  const cargar = async () => {
    const { data } = await supabase.rpc('admin_listar_negocios');
    setNegocios((data as Negocio[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: esAdmin } = await supabase.rpc('es_admin');
      setAutorizado(!!esAdmin);
      if (esAdmin) cargar();
      else setLoading(false);
    })();
  }, []);

  const toggleActivo = async (n: Negocio) => {
    if (!confirm(`¿${n.activo ? 'Desactivar' : 'Reactivar'} el acceso de "${n.nombre}"?`)) return;
    setProcesando(n.id);
    await supabase.rpc('admin_set_negocio_activo', { negocio_id_param: n.id, nuevo_estado: !n.activo });
    setProcesando(null);
    cargar();
  };

  const toggleExpandir = async (id: string) => {
    if (expandido === id) {
      setExpandido(null);
      return;
    }
    setExpandido(id);
    if (!usuariosPorNegocio[id]) {
      const { data } = await supabase.rpc('admin_usuarios_de_negocio', { negocio_id_param: id });
      setUsuariosPorNegocio((prev) => ({ ...prev, [id]: (data as Usuario[]) ?? [] }));
    }
  };

  const filtrados = negocios.filter((n) => n.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  if (autorizado === null || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!autorizado) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">No tenés acceso a esta sección.</p>
        <Link href="/" className="text-sm text-accent underline">
          Volver al panel
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold">Panel Admin</span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">{negocios.length}</p>
          <p className="text-[11px] text-muted leading-tight">Negocios</p>
        </div>
        <div className="rounded-2xl bg-white border border-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">
            {negocios.filter((n) => n.activo).length}
          </p>
          <p className="text-[11px] text-muted leading-tight">Activos</p>
        </div>
        <div className="rounded-2xl bg-white border border-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">
            {negocios.reduce((acc, n) => acc + Number(n.cantidad_ordenes), 0)}
          </p>
          <p className="text-[11px] text-muted leading-tight">Órdenes totales</p>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar negocio..."
        className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
      />

      <div className="flex flex-col gap-2">
        {filtrados.map((n) => {
          const inactivoHaceDias = diasInactivo(n.ultima_actividad);
          const pocaActividad = inactivoHaceDias > 30;
          return (
            <div key={n.id} className="rounded-xl border border-border bg-white shadow-card px-4 py-3 flex flex-col gap-2">
              <button onClick={() => toggleExpandir(n.id)} className="flex items-center justify-between text-left">
                <div>
                  <p className="text-sm font-medium">
                    {n.nombre}{' '}
                    {!n.activo && (
                      <span className="text-[10px] font-bold text-bad bg-bad/10 rounded px-1.5 py-0.5 align-middle">
                        DESACTIVADO
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {n.cantidad_usuarios} usuario{n.cantidad_usuarios === 1 ? '' : 's'} · {n.cantidad_dispositivos}{' '}
                    dispositivos · {n.cantidad_ordenes} órdenes
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${pocaActividad ? 'text-warn font-medium' : 'text-muted'}`}>
                    Última actividad: {formatearFecha(n.ultima_actividad)}
                  </p>
                  <p className="text-xs text-muted">Alta: {formatearFecha(n.creado)}</p>
                </div>
              </button>

              {expandido === n.id && (
                <div className="rounded-lg bg-canvas p-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted">Usuarios</p>
                  {!usuariosPorNegocio[n.id] ? (
                    <p className="text-xs text-muted">Cargando...</p>
                  ) : usuariosPorNegocio[n.id].length === 0 ? (
                    <p className="text-xs text-muted">Sin usuarios registrados.</p>
                  ) : (
                    usuariosPorNegocio[n.id].map((u) => (
                      <p key={u.email} className="text-xs">
                        {u.email}
                      </p>
                    ))
                  )}
                </div>
              )}

              <button
                disabled={procesando === n.id}
                onClick={() => toggleActivo(n)}
                className={`rounded-lg py-2 text-xs font-medium disabled:opacity-40 ${
                  n.activo ? 'border border-bad/30 text-bad' : 'bg-accent hover:bg-accent-hover transition-colors text-white'
                }`}
              >
                {n.activo ? 'Desactivar acceso' : 'Reactivar acceso'}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
