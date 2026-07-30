'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Registro = {
  id: string;
  actor_nombre: string;
  actor_tipo: string;
  accion: string;
  entidad: string;
  created_at: string;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Auditoria() {
  const supabase = crearClienteNavegador();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('auditoria')
        .select('id, actor_nombre, actor_tipo, accion, entidad, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      setRegistros((data as Registro[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Registro de auditoría</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        Acciones sensibles (precios, IMEI, eliminaciones) con quién las hizo y cuándo. Este registro no se puede editar ni
        borrar desde la app.
      </p>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && registros.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          Todavía no hay acciones registradas.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {registros.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-0.5"
          >
            <p className="text-sm">
              <strong>{r.actor_nombre}</strong> {r.accion}
            </p>
            <p className="text-xs text-muted dark:text-dark-text-secondary capitalize">
              {r.actor_tipo} · {formatearFecha(r.created_at)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
