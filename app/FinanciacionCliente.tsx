'use client';

// Pestaña "Financiaciones" de la ficha del cliente — historial de planes en
// cuotas, crear uno nuevo, ajustar/anular/reprogramar. La cuenta corriente
// (pestaña "Cuenta cte.") sigue siendo el libro general; esto es la vista
// específica de cuotas con cronograma propio.
import { useEffect, useMemo, useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import { useActor } from './lib/actor';
import { tienePermiso } from './lib/permisos';
import { simboloMoneda, decimalesMoneda } from './lib/monedas';
import { sanitizarDecimal } from './lib/numeros';
import {
  crearPlanFinanciacion,
  ajustarCuotasFinanciacion,
  anularPlanFinanciacion,
  reprogramarFinanciacion,
  type PlanFinanciacion,
  type CuotaFinanciacion,
} from './lib/financiacion/servicio';
import { generarCronograma, estadoVisualCuota, aFechaISO, type EstadoVisualCuota } from './lib/financiacion/motor';
import { QCard } from './QCard';
import { Boton } from './Boton';
import Modal from './Modal';
import CampoFecha from './CampoFecha';
import { useT } from './lib/idioma';
import { useSucursalActual } from './lib/sucursal';

const ETIQUETA_ESTADO: Record<EstadoVisualCuota, string> = {
  pendiente: 'Pendiente',
  proxima_a_vencer: 'Próxima a vencer',
  vence_hoy: 'Vence hoy',
  parcialmente_pagada: 'Parcial',
  vencida: 'Vencida',
  parcial_y_vencida: 'Parcial y vencida',
  pagada: 'Pagada',
  anulada: 'Anulada',
};
const COLOR_ESTADO: Record<EstadoVisualCuota, string> = {
  pendiente: 'bg-muted/10 text-muted dark:text-dark-text-secondary',
  proxima_a_vencer: 'bg-warn/10 text-warn',
  vence_hoy: 'bg-warn/15 text-warn',
  parcialmente_pagada: 'bg-diag/10 text-diag',
  vencida: 'bg-bad/10 text-bad',
  parcial_y_vencida: 'bg-bad/10 text-bad',
  pagada: 'bg-good/10 text-good',
  anulada: 'bg-muted/10 text-muted dark:text-dark-text-secondary line-through',
};
const ETIQUETA_ESTADO_PLAN: Record<string, string> = { activo: 'Activo', completado: 'Completado', anulado: 'Anulado', reprogramado: 'Reprogramado' };

export default function FinanciacionCliente({
  clienteId,
  monedaCodigo,
  recargar,
  onCambio,
}: {
  clienteId: string;
  monedaCodigo: string;
  recargar: number;
  onCambio: () => void;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_financiacion');
  const puedeAjustar = tienePermiso(actor, 'ajustar_financiacion');
  const moneda = simboloMoneda(monedaCodigo);

  const [planes, setPlanes] = useState<PlanFinanciacion[]>([]);
  const [cuotasPorPlan, setCuotasPorPlan] = useState<Map<string, CuotaFinanciacion[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planAbierto, setPlanAbierto] = useState<string | null>(null);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalAjuste, setModalAjuste] = useState<PlanFinanciacion | null>(null);
  const [modalAnular, setModalAnular] = useState<PlanFinanciacion | null>(null);
  const [modalReprogramar, setModalReprogramar] = useState<PlanFinanciacion | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    const { data: planesData, error: planesErr } = await supabase
      .from('financiacion_planes')
      .select('id, cliente_id, orden_id, moneda, importe_original, entrega_inicial, importe_financiado, cantidad_cuotas, primera_cuota_fecha, estado, observaciones, creado_por, plan_anterior_id, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });
    if (planesErr) {
      setError(t('No pudimos cargar las financiaciones:') + ' ' + planesErr.message);
      setLoading(false);
      return;
    }
    const listaPlanes = (planesData as PlanFinanciacion[]) ?? [];
    setPlanes(listaPlanes);

    if (listaPlanes.length > 0) {
      const { data: cuotasData, error: cuotasErr } = await supabase
        .from('financiacion_cuotas')
        .select('id, plan_id, numero, fecha_vencimiento, importe_original, importe_pagado, estado, fecha_pago_completo')
        .in('plan_id', listaPlanes.map((p) => p.id))
        .order('numero', { ascending: true });
      if (cuotasErr) {
        setError(t('No pudimos cargar las cuotas:') + ' ' + cuotasErr.message);
      } else {
        const mapa = new Map<string, CuotaFinanciacion[]>();
        for (const c of (cuotasData as CuotaFinanciacion[]) ?? []) {
          mapa.set(c.plan_id, [...(mapa.get(c.plan_id) ?? []), c]);
        }
        setCuotasPorPlan(mapa);
      }
    } else {
      setCuotasPorPlan(new Map());
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, recargar]);

  const hoy = useMemo(() => new Date(), []);
  const todasLasCuotas = useMemo(() => Array.from(cuotasPorPlan.values()).flat(), [cuotasPorPlan]);
  const planesActivos = useMemo(() => planes.filter((p) => p.estado === 'activo'), [planes]);

  // ---------- Resumen (spec: total financiado, total pagado, saldo
  // pendiente, próximo vencimiento, cuotas vencidas, progreso) ----------
  const resumen = useMemo(() => {
    const cuotasActivas = todasLasCuotas.filter((c) => c.estado !== 'anulada' && planesActivos.some((p) => p.id === c.plan_id));
    const totalFinanciado = planesActivos.reduce((acc, p) => acc + p.importe_financiado, 0);
    const totalPagado = cuotasActivas.reduce((acc, c) => acc + c.importe_pagado, 0);
    const saldoPendiente = Math.max(0, totalFinanciado - totalPagado);
    const pendientesFuturas = cuotasActivas.filter((c) => c.estado === 'pendiente').sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    const proximoVencimiento = pendientesFuturas[0]?.fecha_vencimiento ?? null;
    const cuotasVencidas = cuotasActivas.filter((c) => {
      const v = estadoVisualCuota({ ...c }, hoy);
      return v === 'vencida' || v === 'parcial_y_vencida';
    }).length;
    const progreso = totalFinanciado > 0 ? Math.round((totalPagado / totalFinanciado) * 100) : 0;
    return { totalFinanciado, totalPagado, saldoPendiente, proximoVencimiento, cuotasVencidas, progreso };
  }, [todasLasCuotas, planesActivos, hoy]);

  const fmt = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;

  if (loading) return <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {planesActivos.length > 0 && (
        <QCard firma padding="sm" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Resumen etiqueta={t('Total financiado')} valor={fmt(resumen.totalFinanciado)} />
          <Resumen etiqueta={t('Total pagado')} valor={fmt(resumen.totalPagado)} tono="text-good" />
          <Resumen etiqueta={t('Saldo pendiente')} valor={fmt(resumen.saldoPendiente)} tono={resumen.saldoPendiente > 0 ? 'text-warn' : undefined} />
          <Resumen etiqueta={t('Próximo vencimiento')} valor={resumen.proximoVencimiento ? new Date(resumen.proximoVencimiento + 'T00:00:00').toLocaleDateString('es-AR') : t('Sin pendientes')} />
          <Resumen etiqueta={t('Cuotas vencidas')} valor={String(resumen.cuotasVencidas)} tono={resumen.cuotasVencidas > 0 ? 'text-bad' : undefined} />
          <Resumen etiqueta={t('Progreso de pago')} valor={`${resumen.progreso}%`} />
        </QCard>
      )}

      {puedeGestionar && (
        <Boton variante="primario" tamano="sm" onClick={() => setModalNuevo(true)} className="self-start">
          + {t('Nuevo plan de financiación')}
        </Boton>
      )}

      {planes.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">{t('Este cliente todavía no tiene ninguna financiación en cuotas.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {planes.map((p) => {
            const cuotas = cuotasPorPlan.get(p.id) ?? [];
            const pagado = cuotas.reduce((acc, c) => acc + c.importe_pagado, 0);
            const progresoPlan = p.importe_financiado > 0 ? Math.round((pagado / p.importe_financiado) * 100) : 0;
            const abierto = planAbierto === p.id;
            return (
              <div key={p.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card overflow-hidden">
                <button onClick={() => setPlanAbierto(abierto ? null : p.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {p.cantidad_cuotas} {p.cantidad_cuotas === 1 ? t('cuota') : t('cuotas')} · {simboloMoneda(p.moneda)}
                      {Math.round(p.importe_financiado).toLocaleString('es-AR')}
                    </p>
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      {t('Creado el')} {new Date(p.created_at).toLocaleDateString('es-AR')} · {t(ETIQUETA_ESTADO_PLAN[p.estado])} · {progresoPlan}% {t('pagado')}
                    </p>
                  </div>
                  <span aria-hidden="true" className="shrink-0 text-muted dark:text-dark-text-secondary text-xs">
                    {abierto ? '▾' : '▸'}
                  </span>
                </button>
                {abierto && (
                  <div className="border-t border-border dark:border-dark-border px-4 py-3 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted dark:text-dark-text-secondary">
                      <p>{t('Importe de la venta:')} {simboloMoneda(p.moneda)}{Math.round(p.importe_original).toLocaleString('es-AR')}</p>
                      {p.entrega_inicial > 0 && <p>{t('Entrega inicial:')} {simboloMoneda(p.moneda)}{Math.round(p.entrega_inicial).toLocaleString('es-AR')}</p>}
                      {p.observaciones && <p className="col-span-2">{t('Obs:')} {p.observaciones}</p>}
                    </div>

                    <div className="flex flex-col gap-1">
                      {cuotas.map((c) => {
                        const estadoVisual = estadoVisualCuota({ ...c }, hoy);
                        const saldoCuota = Math.max(0, c.importe_original - c.importe_pagado);
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/60 dark:border-dark-border/60 last:border-0">
                            <span className="text-muted dark:text-dark-text-secondary shrink-0">
                              {c.numero}/{p.cantidad_cuotas}
                            </span>
                            <span className="shrink-0">{new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                            <span className="flex-1 text-right font-medium">
                              {simboloMoneda(p.moneda)}
                              {Math.round(c.importe_original).toLocaleString('es-AR')}
                              {c.importe_pagado > 0 && c.estado !== 'pagada' && (
                                <span className="text-muted dark:text-dark-text-secondary font-normal"> ({t('falta')} {simboloMoneda(p.moneda)}{Math.round(saldoCuota).toLocaleString('es-AR')})</span>
                              )}
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${COLOR_ESTADO[estadoVisual]}`}>{t(ETIQUETA_ESTADO[estadoVisual])}</span>
                          </div>
                        );
                      })}
                    </div>

                    {p.estado === 'activo' && puedeAjustar && (
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Boton variante="secundario" tamano="sm" onClick={() => setModalAjuste(p)}>
                          {t('Ajustar')}
                        </Boton>
                        <Boton variante="secundario" tamano="sm" onClick={() => setModalReprogramar(p)}>
                          {t('Reprogramar')}
                        </Boton>
                        <Boton variante="peligro" tamano="sm" onClick={() => setModalAnular(p)}>
                          {t('Anular plan')}
                        </Boton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalNuevo && (
        <ModalNuevoPlan
          clienteId={clienteId}
          monedaCodigo={monedaCodigo}
          onClose={() => setModalNuevo(false)}
          onCreado={async () => {
            setModalNuevo(false);
            await cargar();
            onCambio();
          }}
        />
      )}

      {modalAjuste && (
        <ModalAjuste
          plan={modalAjuste}
          cuotas={(cuotasPorPlan.get(modalAjuste.id) ?? []).filter((c) => c.estado === 'pendiente')}
          moneda={simboloMoneda(modalAjuste.moneda)}
          onClose={() => setModalAjuste(null)}
          onGuardado={async () => {
            setModalAjuste(null);
            await cargar();
            onCambio();
          }}
        />
      )}

      {modalAnular && (
        <ModalAnular
          plan={modalAnular}
          onClose={() => setModalAnular(null)}
          onAnulado={async () => {
            setModalAnular(null);
            await cargar();
            onCambio();
          }}
        />
      )}

      {modalReprogramar && (
        <ModalReprogramar
          plan={modalReprogramar}
          clienteId={clienteId}
          saldoPendiente={(cuotasPorPlan.get(modalReprogramar.id) ?? [])
            .filter((c) => c.estado === 'pendiente')
            .reduce((acc, c) => acc + (c.importe_original - c.importe_pagado), 0)}
          onClose={() => setModalReprogramar(null)}
          onReprogramado={async () => {
            setModalReprogramar(null);
            await cargar();
            onCambio();
          }}
        />
      )}
    </div>
  );
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div>
      <p className={`text-base font-display font-semibold leading-none ${tono ?? ''}`}>{valor}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{etiqueta}</p>
    </div>
  );
}

// ---------- Modal: nuevo plan ----------
function ModalNuevoPlan({
  clienteId,
  monedaCodigo,
  onClose,
  onCreado,
}: {
  clienteId: string;
  monedaCodigo: string;
  onClose: () => void;
  onCreado: () => void;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const sucursalActual = useSucursalActual();
  const [importeOriginal, setImporteOriginal] = useState('');
  const [entregaInicial, setEntregaInicial] = useState('');
  const [cantidadCuotas, setCantidadCuotas] = useState('3');
  const [primeraFecha, setPrimeraFecha] = useState(() => aFechaISO(new Date()));
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const original = Number(importeOriginal) || 0;
  const entrega = Number(entregaInicial) || 0;
  const cuotas = Math.max(0, Math.floor(Number(cantidadCuotas) || 0));
  const financiado = original - entrega;
  const moneda = simboloMoneda(monedaCodigo);

  const preview = useMemo(() => {
    if (financiado <= 0 || cuotas <= 0 || !primeraFecha) return null;
    try {
      return generarCronograma({ importeFinanciado: financiado, cantidadCuotas: cuotas, primeraFecha, decimales: decimalesMoneda(monedaCodigo) });
    } catch {
      return null;
    }
  }, [financiado, cuotas, primeraFecha, monedaCodigo]);

  const confirmar = async () => {
    if (financiado <= 0) {
      setError(t('El importe financiado tiene que ser mayor a 0 (la entrega inicial no puede cubrir toda la venta).'));
      return;
    }
    if (cuotas <= 0) {
      setError(t('Elegí al menos 1 cuota.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await crearPlanFinanciacion(supabase, {
      clienteId,
      ordenId: null,
      moneda: monedaCodigo,
      importeOriginal: original,
      entregaInicial: entrega,
      cantidadCuotas: cuotas,
      primeraFecha,
      observaciones,
      sucursalId: sucursalActual.id,
    });
    setGuardando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    onCreado();
  };

  return (
    <Modal titulo={t('Nuevo plan de financiación')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero label={`${t('Importe de la venta')} (${moneda})`} valor={importeOriginal} onChange={setImporteOriginal} />
          <CampoNumero label={t('Entrega inicial (opcional)')} valor={entregaInicial} onChange={setEntregaInicial} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero label={t('Cantidad de cuotas')} valor={cantidadCuotas} onChange={setCantidadCuotas} />
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Fecha de la 1ª cuota')}</label>
            <CampoFecha value={primeraFecha} onChange={setPrimeraFecha} ancho="completo" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Observaciones (opcional)')}</label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {preview && (
          <div className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-2.5">
            <p className="text-xs font-medium mb-1.5">{t('Vista previa del cronograma — financiado:')} {moneda}{Math.round(financiado).toLocaleString('es-AR')}</p>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
              {preview.map((c) => (
                <div key={c.numero} className="flex items-center justify-between text-xs text-muted dark:text-dark-text-secondary">
                  <span>{t('Cuota')} {c.numero}/{cuotas}</span>
                  <span>{new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                  <span className="font-medium text-ink dark:text-dark-text">{moneda}{Math.round(c.importe).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" disabled={!preview} cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Crear plan')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Modal: ajuste ----------
function ModalAjuste({
  plan,
  cuotas,
  moneda,
  onClose,
  onGuardado,
}: {
  plan: PlanFinanciacion;
  cuotas: CuotaFinanciacion[];
  moneda: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const sucursalActual = useSucursalActual();
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cuotasElegidas, setCuotasElegidas] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const toggleCuota = (id: string) =>
    setCuotasElegidas((prev) => {
      const nuevo = new Set(prev);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      return nuevo;
    });

  const confirmar = async () => {
    const m = Number(monto);
    if (!m || m <= 0) {
      setError(t('Poné un monto mayor a cero.'));
      return;
    }
    if (!motivo.trim()) {
      setError(t('El ajuste necesita un motivo.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await ajustarCuotasFinanciacion(supabase, {
      planId: plan.id,
      monto: m,
      motivo,
      cuotaIds: cuotasElegidas.size > 0 ? Array.from(cuotasElegidas) : undefined,
      sucursalId: sucursalActual.id,
    });
    setGuardando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    onGuardado();
  };

  return (
    <Modal titulo={t('Ajustar plan de financiación')} onClose={onClose} maxWidth="max-w-md">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Reduce deuda futura sin tocar cuotas ya pagadas. Si no elegís cuotas puntuales, se aplica desde las últimas cuotas impagas hacia atrás.')}
        </p>
        <CampoNumero label={`${t('Monto a descontar')} (${moneda})`} valor={monto} onChange={setMonto} />
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Motivo (obligatorio)')}</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {cuotas.length > 0 && (
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Aplicar a cuotas puntuales (opcional)')}</label>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {cuotas.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={cuotasElegidas.has(c.id)} onChange={() => toggleCuota(c.id)} className="h-4 w-4 accent-ink" />
                  {t('Cuota')} {c.numero} — {moneda}{Math.round(c.importe_original - c.importe_pagado).toLocaleString('es-AR')} {t('pendiente')}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Aplicar ajuste')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Modal: anular plan ----------
function ModalAnular({ plan, onClose, onAnulado }: { plan: PlanFinanciacion; onClose: () => void; onAnulado: () => void }) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) {
      setError(t('La anulación necesita un motivo.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await anularPlanFinanciacion(supabase, { planId: plan.id, motivo });
    setGuardando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    onAnulado();
  };

  return (
    <Modal titulo={t('Anular plan de financiación')} onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          {t('Se anulan las cuotas que todavía no se pagaron (las ya pagadas quedan intactas). No se puede deshacer.')}
        </p>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Motivo (obligatorio)')}</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="peligro" tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Sí, anular')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Modal: reprogramar ----------
// Crea un plan NUEVO con un cronograma nuevo a partir del saldo pendiente;
// el plan viejo queda con estado 'reprogramado' y su historial intacto (no
// se borra ni se reescribe — ver reprogramarFinanciacion() en servicio.ts).
function ModalReprogramar({
  plan,
  clienteId,
  saldoPendiente,
  onClose,
  onReprogramado,
}: {
  plan: PlanFinanciacion;
  clienteId: string;
  saldoPendiente: number;
  onClose: () => void;
  onReprogramado: () => void;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const sucursalActual = useSucursalActual();
  const [cantidadCuotas, setCantidadCuotas] = useState('3');
  const [primeraFecha, setPrimeraFecha] = useState(() => aFechaISO(new Date()));
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const moneda = simboloMoneda(plan.moneda);

  const cuotas = Math.max(0, Math.floor(Number(cantidadCuotas) || 0));

  const preview = useMemo(() => {
    if (saldoPendiente <= 0 || cuotas <= 0 || !primeraFecha) return null;
    try {
      return generarCronograma({ importeFinanciado: saldoPendiente, cantidadCuotas: cuotas, primeraFecha, decimales: decimalesMoneda(plan.moneda) });
    } catch {
      return null;
    }
  }, [saldoPendiente, cuotas, primeraFecha, plan.moneda]);

  const confirmar = async () => {
    if (saldoPendiente <= 0) {
      setError(t('Este plan no tiene saldo pendiente para reprogramar.'));
      return;
    }
    if (cuotas <= 0) {
      setError(t('Elegí al menos 1 cuota.'));
      return;
    }
    if (!motivo.trim()) {
      setError(t('La reprogramación necesita un motivo.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await reprogramarFinanciacion(supabase, {
      planAnteriorId: plan.id,
      clienteId,
      ordenId: plan.orden_id,
      moneda: plan.moneda,
      saldoARepgramar: saldoPendiente,
      cantidadCuotas: cuotas,
      primeraFecha,
      motivo,
      sucursalId: sucursalActual.id,
    });
    setGuardando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    onReprogramado();
  };

  return (
    <Modal titulo={t('Reprogramar financiación')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Arma un cronograma nuevo con el saldo pendiente')} ({moneda}
          {Math.round(saldoPendiente).toLocaleString('es-AR')}). {t('El plan actual queda marcado como')} &quot;{t('Reprogramado')}&quot; {t('y su historial se conserva completo — las cuotas ya pagadas no se tocan.')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero label={t('Cantidad de cuotas nuevas')} valor={cantidadCuotas} onChange={setCantidadCuotas} />
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Fecha de la 1ª cuota')}</label>
            <CampoFecha value={primeraFecha} onChange={setPrimeraFecha} ancho="completo" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Motivo (obligatorio)')}</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {preview && (
          <div className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-2.5">
            <p className="text-xs font-medium mb-1.5">{t('Nuevo cronograma')}</p>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
              {preview.map((c) => (
                <div key={c.numero} className="flex items-center justify-between text-xs text-muted dark:text-dark-text-secondary">
                  <span>{t('Cuota')} {c.numero}/{cuotas}</span>
                  <span>{new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                  <span className="font-medium text-ink dark:text-dark-text">{moneda}{Math.round(c.importe).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" disabled={!preview || !motivo.trim()} cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Reprogramar')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

function CampoNumero({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(sanitizarDecimal(e.target.value))}
        inputMode="decimal"
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
