'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { EmptyState, Skeleton } from '../_ui';

type Fila = {
  id: string;
  negocio_id: string | null;
  negocio_nombre_snapshot: string;
  admin_email: string;
  accion: string;
  entidad: string;
  motivo: string | null;
  created_at: string;
  total_count: number;
};

function formatearFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

export default function AdminAuditoria() {
  const supabase = crearClienteNavegador();
  const [pagina, setPagina] = useState(1);
  const porPagina = 50;
  const [filas, setFilas] = useState<Fila[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.rpc('admin_auditoria_listar', { p_negocio_id: null, p_pagina: pagina, p_por_pagina: porPagina });
    const f = (data as Fila[]) ?? [];
    setFilas(f);
    setTotalCount(f[0]?.total_count ?? 0);
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(totalCount / porPagina));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Registro de auditoría</h1>
        <p className="text-sm text-dark-text-secondary">Todas las acciones administrativas sobre cualquier negocio, quién las hizo y por qué.</p>
      </header>

      <div className="rounded-2xl bg-dark-surface border border-dark-border shadow-card p-4 sm:p-5">
        {cargando ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <EmptyState titulo="Todavía no hay acciones registradas" icono="—" />
        ) : (
          <div className="flex flex-col divide-y divide-dark-border">
            {filas.map((f) => (
              <div key={f.id} className="py-2.5 flex flex-col gap-0.5">
                <p className="text-sm">
                  <span className="font-medium">{f.admin_email}</span> {f.accion}
                  {' — '}
                  {f.negocio_id ? (
                    <Link href={`/admin/negocios/${f.negocio_id}`} className="text-dark-accent hover:underline">
                      {f.negocio_nombre_snapshot}
                    </Link>
                  ) : (
                    <span className="text-dark-text-secondary">{f.negocio_nombre_snapshot}</span>
                  )}
                </p>
                <p className="text-[11px] text-dark-text-secondary">{formatearFechaHora(f.created_at)}</p>
                {f.motivo && <p className="text-xs text-dark-text-secondary">Motivo: {f.motivo}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-dark-text-secondary">
        <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="p-1.5 rounded-lg border border-dark-border disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina((p) => p + 1)}
          className="p-1.5 rounded-lg border border-dark-border disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
