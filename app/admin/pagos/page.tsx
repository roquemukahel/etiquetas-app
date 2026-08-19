'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { EmptyState, Skeleton, SegmentedChips } from '../_ui';

type Pago = {
  id: string;
  negocio_id: string;
  nombre_negocio: string;
  monto: number;
  moneda: string;
  comprobante_imagen: string | null;
  referencia: string | null;
  estado: string;
  nota_admin: string | null;
  created_at: string;
  revisado_at: string | null;
  total_count: number;
};

const PLANES = ['mensual', 'anual', 'pro'];
const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'aprobado', label: 'Aprobados' },
  { key: 'rechazado', label: 'Rechazados' },
];

function formatearFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR');
}

export default function AdminPagos() {
  const supabase = crearClienteNavegador();
  const [estado, setEstado] = useState('pendiente');
  const [pagina, setPagina] = useState(1);
  const porPagina = 25;

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [diasAprobar, setDiasAprobar] = useState('30');
  const [planAprobar, setPlanAprobar] = useState('mensual');
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('admin_pagos_listar', { p_estado: estado || null, p_pagina: pagina, p_por_pagina: porPagina });
    if (error) {
      console.error('admin_pagos_listar:', error);
      setErrorCarga(error.message);
      setPagos([]);
      setTotalCount(0);
      setCargando(false);
      return;
    }
    setErrorCarga(null);
    const filas = (data as Pago[]) ?? [];
    setPagos(filas);
    setTotalCount(filas[0]?.total_count ?? 0);
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirAprobar = (p: Pago) => {
    setAprobandoId(aprobandoId === p.id ? null : p.id);
    setDiasAprobar('30');
    setPlanAprobar('mensual');
  };

  const confirmarAprobar = async (p: Pago) => {
    setProcesando(p.id);
    const { error } = await supabase.rpc('admin_aprobar_pago', {
      comprobante_id: p.id,
      dias: diasAprobar.trim() === '' ? 30 : Number(diasAprobar),
      nuevo_plan: planAprobar,
    });
    setProcesando(null);
    if (error) {
      alert('No se pudo aprobar el pago:\n' + error.message);
      return;
    }
    setAprobandoId(null);
    cargar();
  };

  const rechazar = async (p: Pago) => {
    const motivo = prompt('¿Por qué se rechaza? (se lo puede volver a intentar)') ?? '';
    setProcesando(p.id);
    const { error } = await supabase.rpc('admin_rechazar_pago', { comprobante_id: p.id, motivo: motivo || null });
    setProcesando(null);
    if (error) {
      alert('No se pudo rechazar el pago:\n' + error.message);
      return;
    }
    cargar();
  };

  const totalPaginas = Math.max(1, Math.ceil(totalCount / porPagina));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Pagos</h1>
        <p className="text-sm text-dark-text-secondary">Comprobantes de pago manual (USDT / transferencia) de todos los negocios.</p>
      </header>

      <SegmentedChips
        valor={estado}
        onChange={(v) => {
          setEstado(v);
          setPagina(1);
        }}
        size="sm"
        opciones={ESTADOS}
      />

      {imagenAmpliada && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setImagenAmpliada(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagenAmpliada} alt="Comprobante ampliado" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {cargando ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : errorCarga ? (
        <EmptyState titulo="No pudimos cargar los pagos" texto={errorCarga} icono="—" />
      ) : pagos.length === 0 ? (
        <EmptyState titulo="Sin comprobantes" texto="No hay pagos que coincidan con este filtro." icono="—" />
      ) : (
        <div className="flex flex-col gap-3">
          {pagos.map((p) => (
            <div key={p.id} className="rounded-2xl bg-dark-surface border border-dark-border shadow-card p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/negocios/${p.negocio_id}`} className="text-sm font-medium hover:underline">
                    {p.nombre_negocio}
                  </Link>
                  <span
                    className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                      p.estado === 'aprobado' ? 'text-good bg-good/10' : p.estado === 'rechazado' ? 'text-bad bg-bad/10' : 'text-warn bg-warn/10'
                    }`}
                  >
                    {p.estado}
                  </span>
                </div>
                <p className="text-sm">
                  {p.monto} {p.moneda}
                  {p.referencia && <span className="text-xs text-dark-text-secondary"> · ref: {p.referencia}</span>}
                  <span className="text-xs text-dark-text-secondary"> · enviado {formatearFecha(p.created_at)}</span>
                  {p.revisado_at && <span className="text-xs text-dark-text-secondary"> · revisado {formatearFecha(p.revisado_at)}</span>}
                </p>
                {p.nota_admin && <p className="text-xs text-dark-text-secondary">Motivo: {p.nota_admin}</p>}
                {p.comprobante_imagen && (
                  <button type="button" onClick={() => setImagenAmpliada(p.comprobante_imagen)} className="self-start relative" aria-label="Ampliar comprobante">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.comprobante_imagen} alt="Comprobante" className="max-h-28 rounded-lg border border-dark-border" />
                    <span className="absolute bottom-1 right-1 bg-black/60 rounded p-0.5">
                      <ZoomIn className="h-3 w-3 text-white" />
                    </span>
                  </button>
                )}

                {p.estado === 'pendiente' && (
                  <>
                    {aprobandoId === p.id && (
                      <div className="rounded-lg bg-dark-bg p-2 flex flex-col gap-2">
                        <div className="flex gap-3">
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-dark-text-secondary">Días de acceso</span>
                            <input
                              value={diasAprobar}
                              onChange={(e) => setDiasAprobar(e.target.value)}
                              inputMode="numeric"
                              className="w-20 bg-dark-surface border border-dark-border rounded-lg px-2 py-1.5 text-xs"
                            />
                          </label>
                          <label className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[10px] text-dark-text-secondary">Plan pagado</span>
                            <select
                              value={planAprobar}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPlanAprobar(v);
                                if (v === 'mensual') setDiasAprobar('30');
                                if (v === 'anual') setDiasAprobar('365');
                              }}
                              className="bg-dark-surface border border-dark-border rounded-lg px-2 py-1.5 text-xs"
                            >
                              {PLANES.map((pl) => (
                                <option key={pl} value={pl}>
                                  {pl}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button
                          disabled={procesando === p.id}
                          onClick={() => confirmarAprobar(p)}
                          className="rounded-lg bg-good text-white py-2 text-xs font-medium disabled:opacity-40"
                        >
                          Confirmar aprobación
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        disabled={procesando === p.id}
                        onClick={() => abrirAprobar(p)}
                        className="flex-1 rounded-lg bg-dark-accent text-white py-2 text-xs font-medium disabled:opacity-40"
                      >
                        {aprobandoId === p.id ? 'Cancelar' : 'Aprobar'}
                      </button>
                      <button
                        disabled={procesando === p.id}
                        onClick={() => rechazar(p)}
                        className="flex-1 rounded-lg border border-bad/30 text-bad py-2 text-xs font-medium disabled:opacity-40"
                      >
                        Rechazar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-dark-text-secondary">
        <button
          type="button"
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => p - 1)}
          className="p-1.5 rounded-lg border border-dark-border disabled:opacity-30"
          aria-label="Página anterior"
        >
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
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
