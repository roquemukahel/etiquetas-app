'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
import { formatearMonto } from '../lib/numeros';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { registrarAuditoria } from '../lib/auditoria';
import { liquidarVendedor, crearAjuste } from '../lib/comisiones/operaciones';
import {
  LABEL_ESTADO_MOV,
  LABEL_TIPO_MOV,
  COLOR_ESTADO_MOV,
  LABEL_TIPO_VENTA,
  LABEL_ESTADO_LIQ,
  type EstadoMovimiento,
  type TipoMovimiento,
  type EstadoLiquidacion,
} from '../lib/comisiones/tipos';
import { agruparComisiones, aplanarReporte, totalReporte, type ModoReporte, type MovimientoReporte } from '../lib/comisiones/reporte';
import { productosSinCategoria, type ProductoSinCategoria } from '../lib/comisiones/sinCategoria';
import { obtenerTodasLasFilas } from '../lib/db';
import { obtenerCategorias, type Categoria } from '../lib/categorias';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { soportaMigracion } from '../lib/migraciones';
import { aFechaISO } from '../lib/financiacion/motor';
import { localeActual } from '../lib/formatoLocal';
import CampoFecha from '../CampoFecha';
import { useT } from '../lib/idioma';

type Movimiento = {
  id: string;
  vendedor_id: string;
  orden_id: string | null;
  tipo_venta: string | null;
  tipo_movimiento: TipoMovimiento;
  base: number;
  comision: number;
  estado: EstadoMovimiento;
  fecha_hecho: string | null;
  created_at: string;
  categoria_id?: string | null;
  vendedores: { nombre: string } | null;
  ordenes: { sucursal_id: string | null; clientes: { nombre: string; apellido: string | null } | null } | null;
};
type Liquidacion = { id: string; vendedor_id: string; estado: EstadoLiquidacion; total_neto: number; pagado: number; created_at: string; vendedores: { nombre: string } | null };
type Periodo = 'mes' | 'mes_anterior' | 'todo' | 'rango';

// Rango de fechas (AAAA-MM-DD, hora local) de cada período del filtro.
function rangoDe(periodo: Periodo, desdeManual: string, hastaManual: string): { desde: string | null; hasta: string | null } {
  const hoy = new Date();
  if (periodo === 'mes') return { desde: aFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: aFechaISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)) };
  if (periodo === 'mes_anterior') return { desde: aFechaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: aFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  if (periodo === 'rango') return { desde: desdeManual || null, hasta: hastaManual || null };
  return { desde: null, hasta: null };
}

export default function Comisiones() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const t = useT();
  const puedeGestionar = tienePermiso(actor, 'gestionar_comisiones');
  const puedeVer = tienePermiso(actor, 'ver_comisiones');

  const [activas, setActivas] = useState<boolean | null>(null);
  const [moneda, setMoneda] = useState('$');
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros del panel: período y sucursal (valen para todo lo que se ve acá)
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desdeManual, setDesdeManual] = useState('');
  const [hastaManual, setHastaManual] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  // Categorías (reporte), privacidad de costos y productos sin categoría
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [conCategoria, setConCategoria] = useState(false);
  const [hayGanancia, setHayGanancia] = useState(false);
  const [sinCategoria, setSinCategoria] = useState<{ total: number; ejemplos: ProductoSinCategoria[] }>({ total: 0, ejemplos: [] });
  const [verSinCategoria, setVerSinCategoria] = useState(false);
  const [modoReporte, setModoReporte] = useState<ModoReporte>('categoria');
  const [separarSub, setSepararSub] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  // Ajuste manual
  const [ajusteAbierto, setAjusteAbierto] = useState(false);
  const [ajVendedor, setAjVendedor] = useState('');
  const [ajMonto, setAjMonto] = useState('');
  const [ajPositivo, setAjPositivo] = useState(true);
  const [ajMotivo, setAjMotivo] = useState('');

  // Un vendedor (sin permiso de gestionar) no ve el detalle por producto cuando alguna comisión se calcula sobre la ganancia: con la
  // comisión de cada producto y su precio se podría deducir el costo y el margen. Solo ve sus totales.
  const restringido = !puedeGestionar && hayGanancia;
  const { desde, hasta } = rangoDe(periodo, desdeManual, hastaManual);

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    const conCat = await soportaMigracion(supabase, 'comisionesMovCategoria');
    setConCategoria(conCat);

    // Los reglas "sobre la ganancia" (activas o ya aplicadas a alguna comisión) activan la privacidad del vendedor.
    const [{ count: reglasGanancia }, { count: movsGanancia }] = await Promise.all([
      supabase.from('comision_reglas').select('id', { count: 'exact', head: true }).eq('tipo_calculo', 'porcentaje_ganancia').eq('activo', true),
      supabase.from('comision_movimientos').select('id', { count: 'exact', head: true }).filter('regla_snapshot->>tipo_calculo', 'eq', 'porcentaje_ganancia'),
    ]);
    const ocultar = !puedeGestionar && ((reglasGanancia ?? 0) > 0 || (movsGanancia ?? 0) > 0);
    setHayGanancia((reglasGanancia ?? 0) > 0 || (movsGanancia ?? 0) > 0);

    const columnas = ocultar
      ? 'id, vendedor_id, tipo_venta, tipo_movimiento, comision, estado, fecha_hecho, created_at, vendedores ( nombre )'
      : 'id, vendedor_id, orden_id, tipo_venta, tipo_movimiento, base, comision, estado, fecha_hecho, created_at' + (conCat ? ', categoria_id' : '') + ', vendedores ( nombre ), ordenes ( sucursal_id, clientes ( nombre, apellido ) )';
    const rango = rangoDe(periodo, desdeManual, hastaManual);
    const filas = await obtenerTodasLasFilas<Movimiento>(supabase, 'comision_movimientos', columnas, [{ columna: 'created_at', ascending: false }], (q) => {
      let r = q;
      if (!puedeGestionar && actor?.id) r = r.eq('vendedor_id', actor.id);
      if (rango.desde) r = r.gte('fecha_hecho', new Date(`${rango.desde}T00:00:00`).toISOString());
      if (rango.hasta) {
        const siguiente = new Date(`${rango.hasta}T00:00:00`);
        siguiente.setDate(siguiente.getDate() + 1);
        r = r.lt('fecha_hecho', siguiente.toISOString());
      }
      return r;
    });

    let ql = supabase.from('comision_liquidaciones').select('id, vendedor_id, estado, total_neto, pagado, created_at, vendedores ( nombre )').order('created_at', { ascending: false }).limit(100);
    if (!puedeGestionar && actor?.id) ql = ql.eq('vendedor_id', actor.id);

    // Estas son independientes entre sí: pedirlas en paralelo evita encadenar round-trips.
    const [{ data: perfil }, { data: liq }, vendResult, listaSucursales, listaCategorias] = await Promise.all([
      supabase.from('perfiles').select('negocios ( moneda, comisiones_activas )').eq('id', user.id).single(),
      ql,
      // Todos los vendedores del negocio (para el ajuste manual, aunque
      // todavía no tengan comisiones generadas) — solo hace falta si puede gestionar.
      puedeGestionar ? supabase.from('vendedores').select('id, nombre').order('nombre') : Promise.resolve({ data: null }),
      obtenerSucursales(supabase),
      obtenerCategorias(supabase, true),
    ]);
    const neg = (perfil as any)?.negocios;
    if (neg?.moneda) setMoneda(simboloMoneda(neg.moneda));
    setActivas(!!neg?.comisiones_activas);
    setMovs(filas);
    setLiquidaciones((liq as any) ?? []);
    if (puedeGestionar) setVendedores((vendResult.data as any) ?? []);
    setSucursales(listaSucursales);
    setCategorias(listaCategorias);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar, actor?.id, periodo, desdeManual, hastaManual]);

  // Productos sin categoría: solo para quien gestiona las comisiones (una vez, no depende del período).
  useEffect(() => {
    if (!puedeGestionar) return;
    productosSinCategoria(supabase).then(setSinCategoria);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar]);

  const m = (n: number) => `${moneda}${formatearMonto(n)}`;
  const fecha = (iso: string) => new Date(iso).toLocaleDateString(localeActual());

  // Movimientos del panel: los del período, y de la sucursal elegida (los ajustes manuales no tienen sucursal: solo con "Todas").
  const visibles = useMemo(
    () => (sucursalId ? movs.filter((mv) => mv.ordenes?.sucursal_id === sucursalId) : movs),
    [movs, sucursalId]
  );

  const tot = useMemo(() => {
    const acc = { generada: 0, aprobada: 0, en_liquidacion: 0, pagada: 0, ajustesReversiones: 0, base: 0 };
    for (const mv of visibles) {
      if (mv.tipo_movimiento === 'comision') {
        acc.base += Number(mv.base) || 0;
        if (mv.estado === 'generada') acc.generada += mv.comision;
        else if (mv.estado === 'aprobada') acc.aprobada += mv.comision;
        else if (mv.estado === 'en_liquidacion') acc.en_liquidacion += mv.comision;
        else if (mv.estado === 'pagada') acc.pagada += mv.comision;
      } else {
        acc.ajustesReversiones += mv.comision;
      }
    }
    return acc;
  }, [visibles]);

  const porVendedor = useMemo(() => {
    const mapa = new Map<string, { vendedorId: string; nombre: string; comMin: number; comMay: number; ajustes: number; pendiente: number; total: number }>();
    for (const mv of visibles) {
      const key = mv.vendedor_id;
      const row = mapa.get(key) ?? { vendedorId: key, nombre: mv.vendedores?.nombre ?? t('Vendedor'), comMin: 0, comMay: 0, ajustes: 0, pendiente: 0, total: 0 };
      if (mv.tipo_movimiento === 'comision') {
        if (mv.tipo_venta === 'mayorista') row.comMay += mv.comision;
        else row.comMin += mv.comision;
      } else row.ajustes += mv.comision;
      // Pendiente de liquidar = generada + aprobada (aún no en liquidación ni pagada)
      if (mv.estado === 'generada' || mv.estado === 'aprobada') row.pendiente += mv.comision;
      row.total = row.comMin + row.comMay + row.ajustes;
      mapa.set(key, row);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [visibles, t]);

  // Reporte por categoría y vendedor (solo con el detalle visible y el SQL de categorías corrido).
  const filasReporte = useMemo(() => {
    const paraReporte: MovimientoReporte[] = visibles.map((mv) => ({
      vendedor_id: mv.vendedor_id,
      vendedor: mv.vendedores?.nombre ?? t('Vendedor'),
      tipo_movimiento: mv.tipo_movimiento,
      categoria_id: mv.categoria_id ?? null,
      comision: Number(mv.comision) || 0,
      base: Number(mv.base) || 0,
    }));
    return agruparComisiones(paraReporte, categorias, modoReporte, separarSub);
  }, [visibles, categorias, modoReporte, separarSub, t]);
  const totalesReporte = useMemo(() => totalReporte(filasReporte), [filasReporte]);

  const alternarFila = (clave: string) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });

  const exportarReporte = async () => {
    const Papa = (await import('papaparse')).default;
    const filas = aplanarReporte(filasReporte).map((f) => ({
      [modoReporte === 'categoria' ? t('Categoría') : t('Vendedor')]: t(f.nivel1),
      [modoReporte === 'categoria' ? t('Vendedor') : t('Categoría')]: t(f.nivel2),
      [t('Comisión')]: f.comision,
      ...(puedeGestionar ? { [t('Ventas comisionadas')]: f.base } : {}),
    }));
    const csv = Papa.unparse(filas);
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comisiones-por-${modoReporte === 'categoria' ? 'categoria' : 'vendedor'}-${desde ?? 'todo'}-${hasta ?? ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const liquidar = async (vendedorId: string, nombre: string, pendiente: number) => {
    if (!puedeGestionar || trabajando) return;
    // La liquidación toma exactamente el período elegido arriba (sin período, todo lo pendiente).
    const rangoTexto = desde || hasta ? ` (${desde ?? '…'} → ${hasta ?? '…'})` : '';
    if (!confirm(`${t('¿Liquidar')} ${m(pendiente)} ${t('de')} ${nombre}${rangoTexto}? ${t('Se aprueban las comisiones pendientes y se arma la liquidación.')}`)) return;
    setTrabajando(vendedorId);
    setError(null);
    const { liquidacionId, error: e } = await liquidarVendedor(supabase, vendedorId, desde, hasta);
    if (e || !liquidacionId) {
      setError(e || t('No se pudo liquidar.'));
      setTrabajando(null);
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó una liquidación de comisiones de ${nombre} (${m(pendiente)})`, entidad: 'comision_liquidacion', entidadId: liquidacionId });
    router.push(`/comisiones/liquidaciones/${liquidacionId}`);
  };

  const guardarAjuste = async () => {
    if (!puedeGestionar || !ajVendedor || !ajMotivo.trim()) {
      setError(t('Elegí vendedor y escribí un motivo.'));
      return;
    }
    const monto = Number(ajMonto.replace(',', '.'));
    if (!monto || monto <= 0) {
      setError(t('Ingresá un monto válido.'));
      return;
    }
    setTrabajando('ajuste');
    setError(null);
    const { error: e } = await crearAjuste(supabase, { vendedorId: ajVendedor, monto, positivo: ajPositivo, motivo: ajMotivo.trim(), moneda: null, usuario: actor?.nombre ?? null });
    if (e) {
      setError(e);
      setTrabajando(null);
      return;
    }
    await registrarAuditoria(supabase, { accion: `cargó un ajuste de comisión ${ajPositivo ? '(+)' : '(−)'} de ${m(monto)}: ${ajMotivo.trim()}`, entidad: 'comision_movimiento' });
    setAjusteAbierto(false);
    setAjVendedor('');
    setAjMonto('');
    setAjMotivo('');
    setTrabajando(null);
    cargar();
  };

  if (loading && movs.length === 0) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando comisiones...')}</p></main>;

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver comisiones.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">{t('Volver al inicio')}</Link>
      </main>
    );
  }

  const claseSelect = 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs';

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 max-w-4xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium mr-auto">{t('Comisiones')}</span>
        {puedeGestionar && <Link href="/configuracion/comisiones" className="text-xs text-accent dark:text-dark-accent underline">{t('Configurar')}</Link>}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {activas === false && (
        <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 text-center flex flex-col items-center gap-2">
          <p className="text-sm font-medium">{t('Las comisiones están desactivadas')}</p>
          {puedeGestionar && <Link href="/configuracion/comisiones" className="mt-1 rounded-xl bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium">{t('Activar comisiones')}</Link>}
        </div>
      )}

      {/* Filtros: período y sucursal */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label={t('Período')} className={claseSelect}>
          <option value="mes">📅 {t('Este mes')}</option>
          <option value="mes_anterior">📅 {t('Mes anterior')}</option>
          <option value="todo">📅 {t('Todo el historial')}</option>
          <option value="rango">📅 {t('Elegir fechas')}</option>
        </select>
        {periodo === 'rango' && (
          <>
            <CampoFecha value={desdeManual} onChange={setDesdeManual} ariaLabel={t('Desde')} />
            <span className="text-xs text-muted dark:text-dark-text-secondary">→</span>
            <CampoFecha value={hastaManual} onChange={setHastaManual} ariaLabel={t('Hasta')} />
          </>
        )}
        {sucursales.length > 1 && !restringido && (
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} aria-label={t('Filtrar por sucursal')} className={claseSelect}>
            <option value="">🏬 {t('Todas las sucursales')}</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                🏬 {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      {sucursalId && <p className="text-[11px] text-muted dark:text-dark-text-secondary -mt-3">{t('Con una sucursal elegida no se cuentan los ajustes manuales (no tienen sucursal).')}</p>}

      {restringido && (
        <p className="text-xs rounded-lg bg-canvas dark:bg-dark-bg px-3 py-2 text-muted dark:text-dark-text-secondary">
          🔒 {t('Por privacidad, el detalle por producto no se muestra porque algunas comisiones se calculan sobre la ganancia. Acá ves tus totales.')}
        </p>
      )}

      {/* Productos sin categoría: no entran en las reglas por categoría */}
      {puedeGestionar && sinCategoria.total > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm flex flex-col gap-2">
          <p>
            ⚠️ {sinCategoria.total} {sinCategoria.total === 1 ? t('producto no tiene categoría') : t('productos no tienen categoría')} {t('y no entran en las reglas por categoría (se les aplica la del tipo de ítem o la general).')}
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link href="/productos?sinCategoria=1" className="text-accent dark:text-dark-accent underline">{t('Verlos y asignarles una categoría')} →</Link>
            <button onClick={() => setVerSinCategoria((v) => !v)} className="underline">
              {verSinCategoria ? t('Ocultar lista') : t('Ver lista')}
            </button>
          </div>
          {verSinCategoria && (
            <ul className="text-xs columns-1 sm:columns-2 gap-4">
              {sinCategoria.ejemplos.map((p, i) => (
                <li key={`${p.nombre}-${i}`} className="truncate">
                  {p.nombre}
                  {p.marca ? <span className="text-muted dark:text-dark-text-secondary"> · {p.marca}</span> : null}
                </li>
              ))}
              {sinCategoria.total > sinCategoria.ejemplos.length && <li className="text-muted dark:text-dark-text-secondary">…</li>}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta valor={m(tot.generada)} etiqueta={t('Generadas (a revisar)')} tono="text-accent dark:text-dark-accent" />
        <Tarjeta valor={m(tot.aprobada)} etiqueta={t('Aprobadas por liquidar')} tono="text-good" />
        <Tarjeta valor={m(tot.pagada)} etiqueta={t('Pagadas')} />
        <Tarjeta valor={m(tot.ajustesReversiones)} etiqueta={t('Ajustes y reversiones')} tono={tot.ajustesReversiones < 0 ? 'text-bad' : undefined} />
      </div>

      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <p className="text-sm font-semibold">{t('Por vendedor')}</p>
          {puedeGestionar && <button onClick={() => setAjusteAbierto((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline">{t('Ajuste manual')}</button>}
        </div>

        {ajusteAbierto && puedeGestionar && (
          <div className="px-4 py-3 border-b border-border dark:border-dark-border bg-canvas dark:bg-dark-bg flex flex-col gap-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select value={ajVendedor} onChange={(e) => setAjVendedor(e.target.value)} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
                <option value="">{t('Vendedor…')}</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
              <select value={ajPositivo ? '1' : '0'} onChange={(e) => setAjPositivo(e.target.value === '1')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
                <option value="1">{t('Bonificación (+)')}</option>
                <option value="0">{t('Descuento (−)')}</option>
              </select>
              <input value={ajMonto} onChange={(e) => setAjMonto(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={t('Monto')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
              <input value={ajMotivo} onChange={(e) => setAjMotivo(e.target.value)} placeholder={t('Motivo (obligatorio)')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button disabled={trabajando === 'ajuste'} onClick={guardarAjuste} className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium disabled:opacity-40">{t('Guardar ajuste')}</button>
          </div>
        )}

        {porVendedor.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">{t('Todavía no hay comisiones.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary text-right">
                  <th className="text-left font-medium px-4 py-2">{t('Vendedor')}</th>
                  <th className="font-medium px-2 py-2">{t('Minorista')}</th>
                  <th className="font-medium px-2 py-2">{t('Mayorista')}</th>
                  <th className="font-medium px-2 py-2">{t('Total')}</th>
                  {puedeGestionar && <th className="font-medium px-4 py-2">{t('Pendiente')}</th>}
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v) => (
                  <tr key={v.vendedorId} className="border-t border-border dark:border-dark-border">
                    <td className="text-left px-4 py-2.5 font-medium">{v.nombre}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMin)}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMay)}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold">{m(v.total)}</td>
                    {puedeGestionar && (
                      <td className="text-right px-4 py-2.5">
                        {v.pendiente > 0 ? (
                          <button
                            disabled={trabajando === v.vendedorId || !!sucursalId}
                            title={sucursalId ? t('Quitá el filtro de sucursal para liquidar: una liquidación incluye las ventas de todas las sucursales.') : undefined}
                            onClick={() => liquidar(v.vendedorId, v.nombre, v.pendiente)}
                            className="rounded-lg bg-good text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                          >
                            {trabajando === v.vendedorId ? '…' : `${t('Liquidar')} ${m(v.pendiente)}`}
                          </button>
                        ) : (
                          <span className="text-xs text-muted dark:text-dark-text-secondary">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reporte por categoría y vendedor */}
      {!restringido && (
        <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold mr-auto">{t('Comisiones por categoría')}</p>
            {conCategoria && filasReporte.length > 0 && (
              <button onClick={exportarReporte} className="text-xs text-accent dark:text-dark-accent underline">{t('Descargar CSV')}</button>
            )}
          </div>
          {!conCategoria ? (
            <p className="text-xs text-warn bg-warn/10 px-4 py-3">{t('Esta función todavía no está activada en la base de datos (comisiones_categoria_supabase.sql).')}</p>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border dark:border-dark-border flex flex-wrap items-center gap-3 text-xs">
                <div className="inline-flex rounded-lg border border-border dark:border-dark-border overflow-hidden">
                  {(['categoria', 'vendedor'] as ModoReporte[]).map((md) => (
                    <button
                      key={md}
                      onClick={() => {
                        setModoReporte(md);
                        setAbiertas(new Set());
                      }}
                      className={`px-3 py-1.5 font-medium ${modoReporte === md ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface'}`}
                    >
                      {md === 'categoria' ? t('Categoría › Vendedor') : t('Vendedor › Categoría')}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={separarSub} onChange={(e) => setSepararSub(e.target.checked)} className="h-3.5 w-3.5 accent-ink" />
                  {t('Separar subcategorías')}
                </label>
              </div>
              {filasReporte.length === 0 ? (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">{t('No hay comisiones en este período.')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary text-right">
                        <th className="text-left font-medium px-4 py-2">{modoReporte === 'categoria' ? t('Categoría') : t('Vendedor')}</th>
                        {puedeGestionar && <th className="font-medium px-2 py-2">{t('Ventas comisionadas')}</th>}
                        {puedeGestionar && <th className="font-medium px-2 py-2">%</th>}
                        <th className="font-medium px-4 py-2">{t('Comisión')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasReporte.map((f) => {
                        const abierta = abiertas.has(f.clave);
                        return (
                          <FilaDeReporte
                            key={f.clave}
                            nombre={t(f.nombre)}
                            comision={f.comision}
                            base={f.base}
                            abierta={abierta}
                            onToggle={() => alternarFila(f.clave)}
                            hijos={f.hijos.map((h) => ({ clave: h.clave, nombre: t(h.nombre), comision: h.comision, base: h.base }))}
                            m={m}
                            conBase={puedeGestionar}
                          />
                        );
                      })}
                      <tr className="border-t-2 border-border dark:border-dark-border font-semibold bg-canvas dark:bg-dark-bg">
                        <td className="text-left px-4 py-2.5">{t('Total')}</td>
                        {puedeGestionar && <td className="text-right px-2 py-2.5 tabular-nums">{m(totalesReporte.base)}</td>}
                        {puedeGestionar && <td className="text-right px-2 py-2.5 tabular-nums">{totalesReporte.base > 0 ? `${((totalesReporte.comision / totalesReporte.base) * 100).toFixed(1)}%` : '—'}</td>}
                        <td className="text-right px-4 py-2.5 tabular-nums">{m(totalesReporte.comision)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-4 py-2 text-[11px] text-muted dark:text-dark-text-secondary border-t border-border dark:border-dark-border">
                {t('La categoría es la que tenía el producto al venderlo. Las comisiones anteriores a esta función toman la categoría actual del producto; los ajustes manuales van aparte.')}
              </p>
            </>
          )}
        </section>
      )}

      {liquidaciones.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Liquidaciones')}</p></div>
          <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
            {liquidaciones.map((l) => (
              <Link key={l.id} href={`/comisiones/liquidaciones/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas dark:hover:bg-dark-bg transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.vendedores?.nombre ?? t('Vendedor')}</p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{fecha(l.created_at)} · {t(LABEL_ESTADO_LIQ[l.estado])}</p>
                </div>
                <span className="text-sm tabular-nums font-semibold">{m(l.total_neto)}</span>
                <span className="text-muted dark:text-dark-text-secondary">&rarr;</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!restringido && (
        <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Movimientos')}</p></div>
          {visibles.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">{t('Sin movimientos.')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
              {visibles.slice(0, 100).map((mv) => {
                const cliente = mv.ordenes?.clientes ? `${mv.ordenes.clientes.nombre} ${mv.ordenes.clientes.apellido || ''}`.trim() : null;
                return (
                  <div key={mv.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {mv.vendedores?.nombre ?? t('Vendedor')}
                        {mv.tipo_venta && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {t(LABEL_TIPO_VENTA[mv.tipo_venta as 'minorista' | 'mayorista'] ?? mv.tipo_venta)}</span>}
                      </p>
                      <p className="text-[11px] text-muted dark:text-dark-text-secondary truncate">{t(LABEL_TIPO_MOV[mv.tipo_movimiento])}{cliente ? ` · ${cliente}` : ''} · {fecha(mv.fecha_hecho || mv.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${COLOR_ESTADO_MOV[mv.estado]}`}>{t(LABEL_ESTADO_MOV[mv.estado])}</span>
                    <span className={`text-sm tabular-nums font-semibold shrink-0 w-24 text-right ${mv.comision < 0 ? 'text-bad' : ''}`}>{m(mv.comision)}</span>
                  </div>
                );
              })}
              {visibles.length > 100 && <p className="text-[11px] text-center text-muted dark:text-dark-text-secondary py-2">{t('Se muestran los 100 más recientes.')}</p>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function FilaDeReporte({
  nombre,
  comision,
  base,
  abierta,
  onToggle,
  hijos,
  m,
  conBase,
}: {
  nombre: string;
  comision: number;
  base: number;
  abierta: boolean;
  onToggle: () => void;
  hijos: { clave: string; nombre: string; comision: number; base: number }[];
  m: (n: number) => string;
  conBase: boolean;
}) {
  const pct = (c: number, b: number) => (b > 0 ? `${((c / b) * 100).toFixed(1)}%` : '—');
  return (
    <>
      <tr className="border-t border-border dark:border-dark-border cursor-pointer hover:bg-canvas dark:hover:bg-dark-bg" onClick={onToggle}>
        <td className="text-left px-4 py-2.5 font-medium">
          <span className="inline-block w-4 text-muted dark:text-dark-text-secondary">{hijos.length > 0 ? (abierta ? '▾' : '▸') : ''}</span>
          {nombre}
        </td>
        {conBase && <td className="text-right px-2 py-2.5 tabular-nums">{m(base)}</td>}
        {conBase && <td className="text-right px-2 py-2.5 tabular-nums text-muted dark:text-dark-text-secondary">{pct(comision, base)}</td>}
        <td className={`text-right px-4 py-2.5 tabular-nums font-semibold ${comision < 0 ? 'text-bad' : ''}`}>{m(comision)}</td>
      </tr>
      {abierta &&
        hijos.map((h) => (
          <tr key={h.clave} className="bg-canvas/60 dark:bg-dark-bg/60">
            <td className="text-left pl-10 pr-4 py-2 text-[13px]">{h.nombre}</td>
            {conBase && <td className="text-right px-2 py-2 tabular-nums text-[13px]">{m(h.base)}</td>}
            {conBase && <td className="text-right px-2 py-2 tabular-nums text-[13px] text-muted dark:text-dark-text-secondary">{pct(h.comision, h.base)}</td>}
            <td className={`text-right px-4 py-2 tabular-nums text-[13px] ${h.comision < 0 ? 'text-bad' : ''}`}>{m(h.comision)}</td>
          </tr>
        ))}
    </>
  );
}

function Tarjeta({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono?: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
      <p className={`text-lg font-display font-semibold leading-none truncate ${tono ?? ''}`}>{valor}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">{etiqueta}</p>
    </div>
  );
}
