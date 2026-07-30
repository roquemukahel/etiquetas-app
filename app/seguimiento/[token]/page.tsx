'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Seguimiento = {
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  estado: string;
  fecha_ingreso_servicio: string | null;
  fecha_reparado: string | null;
  trabajos_realizados: string[] | null;
  nombre_cliente: string | null;
  nombre_negocio: string | null;
  logo_negocio: string | null;
};

const ESTADOS: Record<string, { titulo: string; desc: string; emoji: string }> = {
  servicio_tecnico: {
    titulo: 'En reparación',
    desc: 'Tu equipo está siendo revisado. Te vamos a avisar apenas esté listo.',
    emoji: '🔧',
  },
  reparado: {
    titulo: '¡Listo para retirar!',
    desc: 'Tu equipo ya está reparado. Pasá por el local cuando quieras.',
    emoji: '✅',
  },
  en_canje: {
    titulo: 'Recibido',
    desc: 'Todavía estamos revisando tu equipo.',
    emoji: '📥',
  },
};

export default function Seguimiento() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('seguimiento_publico', { token });
      setDatos((data as Seguimiento[])?.[0] ?? null);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!datos) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-2xl">🔍</p>
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos este seguimiento. Revisá el link que te mandaron.</p>
      </main>
    );
  }

  const info = ESTADOS[datos.estado] ?? { titulo: datos.estado, desc: '', emoji: '📱' };

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10 gap-6">
      <div className="flex flex-col items-center gap-2">
        {datos.logo_negocio ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={datos.logo_negocio} alt={datos.nombre_negocio ?? ''} className="h-14 w-14 rounded-xl object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card" />
        ) : null}
        <p className="text-sm text-muted dark:text-dark-text-secondary">{datos.nombre_negocio}</p>
      </div>

      {datos.nombre_cliente && (
        <p className="text-base text-center">
          Hola <strong>{datos.nombre_cliente}</strong>, así va tu reparación:
        </p>
      )}

      <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-6 flex flex-col items-center gap-3 text-center">
        <p className="text-4xl">{info.emoji}</p>
        <p className="text-lg font-display font-semibold">{info.titulo}</p>
        <p className="text-sm text-muted dark:text-dark-text-secondary">{info.desc}</p>

        <div className="w-full border-t border-border dark:border-dark-border mt-2 pt-3 flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {datos.modelo}
            {datos.capacidad_gb ? ` · ${datos.capacidad_gb}GB` : ''}
            {datos.color ? ` · ${datos.color}` : ''}
          </p>
          {datos.fecha_ingreso_servicio && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              Ingresó: {new Date(datos.fecha_ingreso_servicio).toLocaleDateString('es-AR')}
            </p>
          )}
          {datos.estado === 'reparado' && datos.trabajos_realizados && datos.trabajos_realizados.length > 0 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">Arreglo: {datos.trabajos_realizados.join(', ')}</p>
          )}
          {datos.fecha_reparado && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              Reparado: {new Date(datos.fecha_reparado).toLocaleDateString('es-AR')}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary mt-auto">con Qovento</p>
    </main>
  );
}
