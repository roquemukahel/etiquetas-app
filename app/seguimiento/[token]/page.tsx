'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Evidencia = { id: string; foto_url: string | null; nota: string | null; created_at: string };

type Seguimiento = {
  numero_orden: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  estado: string;
  fecha_ingreso_servicio: string | null;
  fecha_estimada: string | null;
  fecha_reparado: string | null;
  trabajos_realizados: string[] | null;
  nombre_cliente: string | null;
  nombre_negocio: string | null;
  logo_negocio: string | null;
  evidencias: Evidencia[];
};

const ESTADOS: Record<string, { titulo: string; desc: string; emoji: string }> = {
  recibido: {
    titulo: 'Recibido',
    desc: 'Ya recibimos tu equipo. Pronto lo vamos a revisar.',
    emoji: '📥',
  },
  esperando_diagnostico: {
    titulo: 'Esperando diagnóstico',
    desc: 'Tu equipo está en cola para que un técnico lo revise.',
    emoji: '🔍',
  },
  esperando_aprobacion: {
    titulo: 'Esperando tu aprobación',
    desc: 'Ya armamos el presupuesto. Contactanos para aprobarlo y arrancamos con la reparación.',
    emoji: '📋',
  },
  esperando_repuesto: {
    titulo: 'Esperando un repuesto',
    desc: 'Estamos esperando que llegue un repuesto para terminar la reparación.',
    emoji: '📦',
  },
  en_reparacion: {
    titulo: 'En reparación',
    desc: 'Tu equipo está siendo reparado. Te vamos a avisar apenas esté listo.',
    emoji: '🔧',
  },
  listo_para_entregar: {
    titulo: '¡Listo para retirar!',
    desc: 'Tu equipo ya está reparado. Pasá por el local cuando quieras.',
    emoji: '✅',
  },
  entregado: {
    titulo: 'Entregado',
    desc: 'Este equipo ya fue retirado del local.',
    emoji: '🎉',
  },
  cancelado: {
    titulo: 'Cancelado',
    desc: 'Esta reparación fue cancelada. Consultanos por más información.',
    emoji: '✖️',
  },
};

export default function Seguimiento() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [hayNovedadesNuevas, setHayNovedadesNuevas] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('seguimiento_publico', { token });
      const d = (data as Seguimiento[])?.[0] ?? null;
      setDatos(d);
      setLoading(false);

      // "Novedad nueva" = quedó al menos una evidencia sin ver desde la
      // última vez que este mismo navegador abrió este link — no hay
      // notificación push real (no hay esa infraestructura en la app), pero
      // así se destaca lo nuevo cada vez que el cliente vuelve a entrar.
      if (d && d.evidencias && d.evidencias.length > 0) {
        const clave = `seguimiento-visto-${token}`;
        let ultimaVista: string | null = null;
        try {
          ultimaVista = localStorage.getItem(clave);
        } catch {}
        const ultimaEvidencia = d.evidencias[d.evidencias.length - 1].created_at;
        if (!ultimaVista || new Date(ultimaEvidencia) > new Date(ultimaVista)) {
          setHayNovedadesNuevas(true);
        }
        try {
          localStorage.setItem(clave, ultimaEvidencia);
        } catch {}
      }
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
          {datos.numero_orden && <p className="text-xs text-muted dark:text-dark-text-secondary">Orden {datos.numero_orden}</p>}
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
          {datos.fecha_estimada && datos.estado !== 'entregado' && datos.estado !== 'listo_para_entregar' && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              Fecha estimada: {new Date(datos.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR')}
            </p>
          )}
          {datos.trabajos_realizados && datos.trabajos_realizados.length > 0 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">Arreglo: {datos.trabajos_realizados.join(', ')}</p>
          )}
          {datos.fecha_reparado && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              Reparado: {new Date(datos.fecha_reparado).toLocaleDateString('es-AR')}
            </p>
          )}
        </div>
      </div>

      {(datos.evidencias?.length ?? 0) > 0 && (
        <div className="w-full max-w-xs flex flex-col gap-2">
          {hayNovedadesNuevas && (
            <p className="text-xs font-medium text-accent dark:text-dark-accent text-center">🔔 Hay novedades nuevas</p>
          )}
          <p className="text-xs font-semibold text-muted dark:text-dark-text-secondary uppercase tracking-wide">
            Novedades del técnico
          </p>
          {[...datos.evidencias].reverse().map((e) => (
            <div key={e.id} className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3 flex gap-2.5">
              {e.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.foto_url} alt="" className="h-16 w-16 object-cover rounded-lg shrink-0" />
              )}
              <div className="min-w-0">
                {e.nota && <p className="text-sm whitespace-pre-wrap">{e.nota}</p>}
                <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-0.5">
                  {new Date(e.created_at).toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted dark:text-dark-text-secondary mt-auto">con Qovento</p>
    </main>
  );
}
