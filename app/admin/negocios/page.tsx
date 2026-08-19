'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Papa from 'papaparse';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { EmptyState, Skeleton, SegmentedChips, EstadoBadge, AccesoManualChip } from '../_ui';

type Fila = {
  id: string;
  nombre: string;
  activo: boolean;
  estado_suscripcion: string;
  plan: string | null;
  fecha_fin_prueba: string | null;
  acceso_manual_hasta: string | null;
  created_at: string;
  propietario_email: string | null;
  cantidad_usuarios: number;
  cantidad_dispositivos: number;
  cantidad_ordenes: number;
  ultima_actividad: string;
  comprobantes_pendientes: number;
  vencimiento: string | null;
  total_count: number;
};

type Vista = 'todos' | 'activos' | 'en_prueba' | 'por_vencer' | 'pago_pendiente' | 'inactivos' | 'cancelados';

const VISTAS: { key: Vista; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'activos', label: 'Activos' },
  { key: 'en_prueba', label: 'En prueba' },
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'pago_pendiente', label: 'Pago pendiente' },
  { key: 'inactivos', label: 'Inactivos' },
  { key: 'cancelados', label: 'Cancelados' },
];

const COLUMNAS: { campo: string; label: string; ordenable: boolean }[] = [
  { campo: 'nombre', label: 'Negocio', ordenable: true },
  { campo: 'propietario', label: 'Propietario', ordenable: false },
  { campo: 'plan', label: 'Plan', ordenable: false },
  { campo: 'estado', label: 'Estado', ordenable: false },
  { campo: 'created_at', label: 'Alta', ordenable: true },
  { campo: 'vencimiento', label: 'Vencimiento', ordenable: true },
  { campo: 'ultima_actividad', label: 'Última actividad', ordenable: true },
  { campo: 'usuarios', label: 'Usuarios', ordenable: false },
  { campo: 'dispositivos', label: 'Dispositivos', ordenable: false },
  { campo: 'ordenes', label: 'Órdenes', ordenable: false },
];

type Filtros = {
  q: string;
  vista: Vista;
  plan: string;
  orden: string;
  dir: 'asc' | 'desc';
  pagina: number;
  porPagina: number;
};

const FILTROS_DEFAULT: Filtros = { q: '', vista: 'todos', plan: '', orden: 'created_at', dir: 'desc', pagina: 1, porPagina: 25 };

function formatearFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR');
}

// El estado de filtros/orden/página vive en la URL para que se pueda
// compartir o volver atrás con el navegador — pero se lee de
// window.location.search en un efecto (no con useSearchParams()), mismo
// criterio que el resto de la app (ver app/stock/nuevo/page.tsx), para no
// depender de un Suspense boundary.
function leerFiltrosDeUrl(): Filtros {
  if (typeof window === 'undefined') return FILTROS_DEFAULT;
  const p = new URLSearchParams(window.location.search);
  return {
    q: p.get('q') ?? '',
    vista: (p.get('vista') as Vista) || 'todos',
    plan: p.get('plan') ?? '',
    orden: p.get('orden') ?? 'created_at',
    dir: (p.get('dir') as 'asc' | 'desc') || 'desc',
    pagina: Number(p.get('pagina') ?? '1'),
    porPagina: Number(p.get('por_pagina') ?? '25'),
  };
}

export default function AdminNegocios() {
  const supabase = crearClienteNavegador();
  const router = useRouter();

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_DEFAULT);
  const [busquedaInput, setBusquedaInput] = useState('');
  const [hidratado, setHidratado] = useState(false);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const f = leerFiltrosDeUrl();
    setFiltros(f);
    setBusquedaInput(f.q);
    setHidratado(true);
  }, []);

  // Cada cambio de filtros se refleja en la URL (para poder compartir el
  // link o volver atrás) — con replace, no push, así que aplicar filtros no
  // llena el historial de navegación con un paso por cada click.
  useEffect(() => {
    if (!hidratado) return;
    const p = new URLSearchParams();
    if (filtros.q) p.set('q', filtros.q);
    if (filtros.vista !== 'todos') p.set('vista', filtros.vista);
    if (filtros.plan) p.set('plan', filtros.plan);
    if (filtros.orden !== 'created_at') p.set('orden', filtros.orden);
    if (filtros.dir !== 'desc') p.set('dir', filtros.dir);
    if (filtros.pagina !== 1) p.set('pagina', String(filtros.pagina));
    if (filtros.porPagina !== 25) p.set('por_pagina', String(filtros.porPagina));
    const qs = p.toString();
    router.replace(`/admin/negocios${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, hidratado]);

  // Búsqueda con debounce: el input se escribe libre, pero recién dispara
  // una consulta nueva 400ms después de que el usuario deja de tipear.
  useEffect(() => {
    if (!hidratado) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFiltros((f) => (f.q === busquedaInput ? f : { ...f, q: busquedaInput, pagina: 1 }));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaInput, hidratado]);

  const cargar = useCallback(async () => {
    if (!hidratado) return;
    setCargando(true);
    const { data, error } = await supabase.rpc('admin_negocios_directorio', {
      p_busqueda: filtros.q || null,
      p_vista: filtros.vista,
      p_plan: filtros.plan || null,
      p_orden_campo: filtros.orden,
      p_orden_dir: filtros.dir,
      p_pagina: filtros.pagina,
      p_por_pagina: filtros.porPagina,
    });
    if (error) {
      console.error('admin_negocios_directorio:', error);
    } else {
      const filasData = (data as Fila[]) ?? [];
      setFilas(filasData);
      setTotalCount(filasData[0]?.total_count ?? 0);
    }
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidratado, filtros.q, filtros.vista, filtros.plan, filtros.orden, filtros.dir, filtros.pagina, filtros.porPagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(totalCount / filtros.porPagina));

  const cambiarOrden = (campo: string) => {
    setFiltros((f) => (f.orden === campo ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, orden: campo, dir: 'desc' }));
  };

  const exportarCsv = async () => {
    setExportando(true);
    const { data } = await supabase.rpc('admin_negocios_directorio', {
      p_busqueda: filtros.q || null,
      p_vista: filtros.vista,
      p_plan: filtros.plan || null,
      p_orden_campo: filtros.orden,
      p_orden_dir: filtros.dir,
      p_pagina: 1,
      p_por_pagina: Math.min(totalCount || 5000, 5000),
    });
    const filasExport = (data as Fila[]) ?? [];
    const csv = Papa.unparse(
      filasExport.map((f) => ({
        negocio: f.nombre,
        propietario: f.propietario_email ?? '',
        plan: f.plan ?? '',
        estado: f.activo ? f.estado_suscripcion : 'suspendido',
        alta: formatearFecha(f.created_at),
        vencimiento: formatearFecha(f.vencimiento),
        ultima_actividad: formatearFecha(f.ultima_actividad),
        usuarios: f.cantidad_usuarios,
        dispositivos: f.cantidad_dispositivos,
        ordenes: f.cantidad_ordenes,
        comprobantes_pendientes: f.comprobantes_pendientes,
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `negocios-qovento-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportando(false);
  };

  return (
    <div className="flex flex-col gap-4 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold">Negocios</h1>
          <p className="text-sm text-dark-text-secondary">{totalCount} negocio{totalCount === 1 ? '' : 's'} en total</p>
        </div>
        <button
          type="button"
          disabled={exportando || totalCount === 0}
          onClick={exportarCsv}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dark-border px-3 py-2 text-sm font-medium text-dark-text-secondary hover:text-dark-text hover:border-dark-text-secondary transition-colors disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          {exportando ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-text-secondary" />
          <input
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            placeholder="Buscar por nombre, email, teléfono o ID..."
            className="w-full bg-dark-surface border border-dark-border rounded-xl pl-9 pr-3 py-2 text-sm placeholder:text-dark-text-secondary"
          />
        </div>
        <SegmentedChips
          valor={filtros.vista}
          onChange={(v) => setFiltros((f) => ({ ...f, vista: v, pagina: 1 }))}
          size="sm"
          opciones={VISTAS}
        />
      </div>

      <div className="rounded-2xl bg-dark-surface border border-dark-border shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-dark-border text-left text-xs text-dark-text-secondary">
                {COLUMNAS.map((c) => (
                  <th key={c.campo} className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {c.ordenable ? (
                      <button type="button" onClick={() => cambiarOrden(c.campo)} className="inline-flex items-center gap-1 hover:text-dark-text">
                        {c.label}
                        {filtros.orden === c.campo ? (
                          filtros.dir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-dark-border/50">
                    <td colSpan={COLUMNAS.length} className="px-3 py-2">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS.length}>
                    <EmptyState titulo="Sin resultados" texto="Probá con otra búsqueda o filtro." icono="—" />
                  </td>
                </tr>
              ) : (
                filas.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/admin/negocios/${f.id}`)}
                    className="border-b border-dark-border/50 hover:bg-dark-bg cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap max-w-[220px] truncate">{f.nombre}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap max-w-[200px] truncate">{f.propietario_email ?? '—'}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap">{f.plan ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <EstadoBadge activo={f.activo} estadoSuscripcion={f.estado_suscripcion} />
                        <AccesoManualChip hasta={f.acceso_manual_hasta} />
                        {f.comprobantes_pendientes > 0 && <span className="text-[10px] text-warn">● {f.comprobantes_pendientes}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap">{formatearFecha(f.created_at)}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap">{formatearFecha(f.vencimiento)}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap">{formatearFecha(f.ultima_actividad)}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap tabular-nums">{f.cantidad_usuarios}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap tabular-nums">{f.cantidad_dispositivos}</td>
                    <td className="px-3 py-2.5 text-dark-text-secondary whitespace-nowrap tabular-nums">{f.cantidad_ordenes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-dark-text-secondary">
          <span>Mostrar</span>
          <select
            value={filtros.porPagina}
            onChange={(e) => setFiltros((f) => ({ ...f, porPagina: Number(e.target.value), pagina: 1 }))}
            className="bg-dark-surface border border-dark-border rounded-lg px-2 py-1"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>por página</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-dark-text-secondary">
          <button
            type="button"
            disabled={filtros.pagina <= 1}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
            className="p-1.5 rounded-lg border border-dark-border disabled:opacity-30"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            Página {filtros.pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={filtros.pagina >= totalPaginas}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
            className="p-1.5 rounded-lg border border-dark-border disabled:opacity-30"
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
