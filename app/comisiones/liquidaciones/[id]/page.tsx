'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { simboloMoneda } from '../../../lib/monedas';
import { useActor } from '../../../lib/actor';
import { tienePermiso } from '../../../lib/permisos';
import { registrarPagoLiquidacion } from '../../../lib/comisiones/operaciones';
import { LABEL_ESTADO_LIQ, LABEL_TIPO_MOV, LABEL_TIPO_VENTA, type EstadoLiquidacion, type TipoMovimiento } from '../../../lib/comisiones/tipos';
import { useT } from '../../../lib/idioma';
import { formatearMonto } from '../../../lib/numeros';

type Liq = {
  id: string;
  vendedor_id: string;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  estado: EstadoLiquidacion;
  total_bruto: number;
  total_neto: number;
  pagado: number;
  moneda: string | null;
  vendedores: { nombre: string } | null;
};
type Mov = { id: string; tipo_movimiento: TipoMovimiento; fecha_hecho: string | null; base: number; comision: number; orden_id: string | null; tipo_venta: string | null; motivo: string | null };
type Pago = { id: string; monto: number; medio: string | null; referencia: string | null; fecha: string };

export default function DetalleLiquidacion() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeGestionar = tienePermiso(actor, 'gestionar_comisiones');

  const [liq, setLiq] = useState<Liq | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [monedaSimbolo, setMonedaSimbolo] = useState('$');
  const [loading, setLoading] = useState(true);
  const [montoPago, setMontoPago] = useState('');
  const [medioPago, setMedioPago] = useState('');
  const [refPago, setRefPago] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    // Estas 4 son independientes entre sí (todas filtran por "id"/"user.id",
    // ya conocidos) — pedirlas en paralelo evita encadenar 4 round-trips.
    const [{ data: perfil }, { data: l }, { data: m }, { data: p }] = await Promise.all([
      user ? supabase.from('perfiles').select('negocios ( nombre, moneda )').eq('id', user.id).single() : Promise.resolve({ data: null }),
      supabase
        .from('comision_liquidaciones')
        .select('id, vendedor_id, periodo_desde, periodo_hasta, estado, total_bruto, total_neto, pagado, moneda, vendedores ( nombre )')
        .eq('id', id)
        .single(),
      supabase
        .from('comision_movimientos')
        .select('id, tipo_movimiento, fecha_hecho, base, comision, orden_id, tipo_venta, motivo')
        .eq('liquidacion_id', id)
        .order('fecha_hecho', { ascending: true }),
      supabase.from('comision_liquidacion_pagos').select('id, monto, medio, referencia, fecha').eq('liquidacion_id', id).order('fecha'),
    ]);
    if (user) {
      const neg = (perfil as any)?.negocios;
      setNombreNegocio(neg?.nombre ?? '');
      if (neg?.moneda) setMonedaSimbolo(simboloMoneda(neg.moneda));
    }
    setLiq((l as any) ?? null);
    setMovs((m as any) ?? []);
    setPagos((p as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const m = (n: number) => `${monedaSimbolo}${formatearMonto(n)}`;

  const pagar = async () => {
    if (!liq || !puedeGestionar) return;
    const monto = Number(montoPago.replace(',', '.'));
    if (!monto || monto <= 0) return setError(t('Ingresá un monto válido.'));
    setGuardando(true);
    setError(null);
    const { error: e } = await registrarPagoLiquidacion(supabase, liq.id, monto, medioPago.trim() || null, refPago.trim() || null, actor?.nombre ?? null);
    setGuardando(false);
    if (e) return setError(e);
    setMontoPago('');
    setMedioPago('');
    setRefPago('');
    cargar();
  };

  const exportarCSV = async () => {
    const Papa = (await import('papaparse')).default;
    const filas = movs.map((mv) => ({
      [t('Fecha')]: mv.fecha_hecho ? new Date(mv.fecha_hecho).toLocaleDateString('es-AR') : '',
      [t('Concepto')]: t(LABEL_TIPO_MOV[mv.tipo_movimiento]),
      [t('Tipo de venta')]: mv.tipo_venta ?? '',
      // Sin redondear a entero: es el CSV que el vendedor usa para
      // reconciliar su pago, tiene que reflejar los centavos reales.
      [t('Base')]: Math.round(mv.base * 100) / 100,
      [t('Comisión')]: Math.round(mv.comision * 100) / 100,
      [t('Motivo')]: mv.motivo ?? '',
    }));
    const csv = Papa.unparse(filas);
    descargar(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `liquidacion-${liq?.vendedores?.nombre ?? ''}.csv`);
  };

  const exportarPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = 16;
    doc.setFontSize(14);
    doc.text(nombreNegocio || 'Qovento', 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(`${t('Liquidación de comisiones')} — ${liq?.vendedores?.nombre ?? ''}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    const periodo = liq?.periodo_desde ? `${liq.periodo_desde} ${t('a')} ${liq.periodo_hasta ?? t('hoy')}` : t('Todo');
    doc.text(`${t('Período:')} ${periodo}   ·   ${t('Generado:')} ${new Date().toLocaleDateString('es-AR')}`, 14, y);
    y += 8;
    doc.setFontSize(9);
    doc.text(t('Fecha'), 14, y);
    doc.text(t('Concepto'), 40, y);
    doc.text(t('Base'), 120, y, { align: 'right' } as any);
    doc.text(t('Comisión'), 170, y, { align: 'right' } as any);
    y += 2;
    doc.line(14, y, 196, y);
    y += 5;
    for (const mv of movs) {
      if (y > 275) { doc.addPage(); y = 16; }
      doc.text(mv.fecha_hecho ? new Date(mv.fecha_hecho).toLocaleDateString('es-AR') : '', 14, y);
      doc.text(t(LABEL_TIPO_MOV[mv.tipo_movimiento]).slice(0, 40), 40, y);
      doc.text(m(mv.base), 120, y, { align: 'right' } as any);
      doc.text(m(mv.comision), 170, y, { align: 'right' } as any);
      y += 5;
    }
    y += 3;
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(t('Total neto:'), 120, y, { align: 'right' } as any);
    doc.text(m(liq?.total_neto ?? 0), 170, y, { align: 'right' } as any);
    y += 6;
    doc.text(t('Pagado:'), 120, y, { align: 'right' } as any);
    doc.text(m(liq?.pagado ?? 0), 170, y, { align: 'right' } as any);
    y += 6;
    doc.text(t('Saldo:'), 120, y, { align: 'right' } as any);
    doc.text(m((liq?.total_neto ?? 0) - (liq?.pagado ?? 0)), 170, y, { align: 'right' } as any);
    doc.save(`liquidacion-${liq?.vendedores?.nombre ?? ''}.pdf`);
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p></main>;
  if (!liq) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted dark:text-dark-text-secondary">{t('Liquidación no encontrada.')}</p></main>;

  const saldo = liq.total_neto - liq.pagado;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/comisiones" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium mr-auto">{t('Liquidación')} · {liq.vendedores?.nombre}</span>
        <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-accent/15 text-accent">{t(LABEL_ESTADO_LIQ[liq.estado])}</span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className="text-lg font-display font-semibold leading-none">{m(liq.total_neto)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Total a pagar')}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className="text-lg font-display font-semibold leading-none text-good">{m(liq.pagado)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Pagado')}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className={`text-lg font-display font-semibold leading-none ${saldo > 0 ? 'text-warn' : ''}`}>{m(saldo)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Saldo')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={exportarPDF} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">{t('Descargar PDF')}</button>
        <button onClick={exportarCSV} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">{t('Exportar CSV')}</button>
      </div>

      {puedeGestionar && liq.estado !== 'pagada' && liq.estado !== 'anulada' && (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold">{t('Registrar un pago')}</p>
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input value={montoPago} onChange={(e) => setMontoPago(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={t('Monto')} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
            <input value={medioPago} onChange={(e) => setMedioPago(e.target.value)} placeholder={t('Medio (opcional)')} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
            <input value={refPago} onChange={(e) => setRefPago(e.target.value)} placeholder={t('Referencia')} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button disabled={guardando} onClick={pagar} className="rounded-xl bg-accent dark:bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-40">
            {guardando ? t('Registrando...') : t('Registrar pago')}
          </button>
        </div>
      )}

      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Detalle')}</p></div>
        <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
          {movs.map((mv) => (
            <div key={mv.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{t(LABEL_TIPO_MOV[mv.tipo_movimiento])}{mv.motivo ? ` · ${mv.motivo}` : ''}</p>
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">{mv.fecha_hecho ? new Date(mv.fecha_hecho).toLocaleDateString('es-AR') : ''}{mv.tipo_venta ? ` · ${t(LABEL_TIPO_VENTA[mv.tipo_venta as 'minorista' | 'mayorista'] ?? mv.tipo_venta)}` : ''}</p>
              </div>
              <span className={`text-sm tabular-nums font-semibold ${mv.comision < 0 ? 'text-bad' : ''}`}>{m(mv.comision)}</span>
            </div>
          ))}
        </div>
      </section>

      {pagos.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Pagos')}</p></div>
          <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{p.medio || t('Pago')}{p.referencia ? ` · ${p.referencia}` : ''}</p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{new Date(p.fecha).toLocaleDateString('es-AR')}</p>
                </div>
                <span className="text-sm tabular-nums font-semibold text-good">{m(p.monto)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
