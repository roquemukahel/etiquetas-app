'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { useT } from '../../lib/idioma';

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
  const actor = useActor();
  const t = useT();
  const puedeVerAuditoria = tienePermiso(actor, 'auditoria');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busqueda), 250);
    return () => clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    if (!puedeVerAuditoria) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('auditoria')
        .select('id, actor_nombre, actor_tipo, accion, entidad, created_at')
        .order('created_at', { ascending: false })
        // Antes traía solo los últimos 200 — con mucho movimiento, buscar
        // algo de hace unos días quedaba directamente afuera. 2000 filas de
        // texto es un pedido liviano (nada de fotos ni base64 de por medio).
        .limit(2000);
      setRegistros((data as Registro[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerAuditoria]);

  const filtrados = useMemo(() => {
    const q = busquedaDebounced.trim().toLowerCase();
    if (!q) return registros;
    return registros.filter(
      (r) =>
        r.accion?.toLowerCase().includes(q) ||
        r.actor_nombre?.toLowerCase().includes(q) ||
        r.actor_tipo?.toLowerCase().includes(q) ||
        r.entidad?.toLowerCase().includes(q)
    );
  }, [registros, busquedaDebounced]);

  if (!puedeVerAuditoria) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Auditoría.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Registro de auditoría')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        {t('Acciones sensibles (precios, IMEI, eliminaciones) con quién las hizo y cuándo. Este registro no se puede editar ni borrar desde la app.')}
      </p>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('Buscar por persona, acción o entidad...')}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
      {!loading && registros.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {t('Todavía no hay acciones registradas.')}
        </p>
      )}
      {!loading && registros.length > 0 && filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {t('Ninguna acción coincide con')} «{busqueda}».
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((r) => (
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
