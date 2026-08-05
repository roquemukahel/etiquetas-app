'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
import { obtenerTodasLasFilas } from '../lib/db';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { medioLabel } from '../lib/cuentaCorriente';
import { RankingBarras, RankingTorta, Dato } from './graficos';
import {
  Periodo,
  OrdenR,
  ItemR,
  PagoR,
  CreditoR,
  rangoDe,
  bloqueVentas,
  variacion,
  montoVenta,
  serieEvolucion,
  MetricaSerie,
  ESTADOS_COBRADOS,
} from './datos';
import { StatCard, SeccionCard, EmptyState, SegmentedChips, AnalyticsTabs, formatMoneda } from './ui';
import { LineAreaChart } from './charts';

type VistaRanking = 'barras' | 'torta';
type Tab = 'resumen' | 'ventas' | 'caja' | 'cobrar' | 'stock' | 'servicio' | 'clientes' | 'equipo' | 'proveedores';

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'caja', label: 'Caja y pagos' },
  { key: 'cobrar', label: 'Cuentas por cobrar' },
  { key: 'stock', label: 'Stock' },
  { key: 'servicio', label: 'Servicio técnico' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'proveedores', label: 'Compras y proveedores' },
];

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
];

const ETIQUETA_PERIODO: Record<Periodo, string> = { hoy: 'hoy', semana: 'la última semana', mes: 'este mes', anio: 'este año' };
const ETIQUETA_PERIODO_ANT: Record<Periodo, string> = {
  hoy: 'ayer',
  semana: 'la semana anterior',
  mes: 'el mes anterior',
  anio: 'el año anterior',
};

type Persona = { id: string; nombre: string; foto_url: string | null };
type Cliente = { id: string; nombre: string; apellido: string | null };
type Proveedor = { id: string; nombre: string };
type Reparacion = { tecnico_id: string | null; fecha_reparado: string };
type IngresoServicio = { cliente_id: string | null; fecha_ingreso_servicio: string };
type DispositivoCompra = { proveedor_id: string | null; costo: number | null; created_at: string };
type CompraManual = { proveedor_id: string; cantidad: number; precio_unitario: number | null; created_at: string };

const KEY_OCULTAR = 'qovento:analitica-ocultar-montos';

export default function Estadisticas() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');
  const puedeVerCostos = tienePermiso(actor, 'ver_costos');

  const [tab, setTab] = useState<Tab>('resumen');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [comparar, setComparar] = useState(true);
  const [ocultarMontos, setOcultarMontos] = useState(false);
  const [metricaChart, setMetricaChart] = useState<MetricaSerie>('ventas');

  const [vistaVendedores, setVistaVendedores] = useState<VistaRanking>('barras');
  const [vistaTecnicos, setVistaTecnicos] = useState<VistaRanking>('barras');
  const [vistaFormaPago, setVistaFormaPago] = useState<VistaRanking>('torta');
  const [vistaProveedores, setVistaProveedores] = useState<VistaRanking>('barras');
  const [vistaCompradores, setVistaCompradores] = useState<VistaRanking>('barras');
  const [vistaClientesServicio, setVistaClientesServicio] = useState<VistaRanking>('barras');

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [vendedores, setVendedores] = useState<Persona[]>([]);
  const [tecnicos, setTecnicos] = useState<Persona[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenR[]>([]);
  const [ordenItems, setOrdenItems] = useState<(ItemR & { created_at: string })[]>([]);
  const [pagos, setPagos] = useState<PagoR[]>([]);
  const [credito, setCredito] = useState<CreditoR[]>([]);
  const [porCobrar, setPorCobrar] = useState(0);
  const [vencidoTotal, setVencidoTotal] = useState(0);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [ingresosServicio, setIngresosServicio] = useState<IngresoServicio[]>([]);
  const [comprasProveedor, setComprasProveedor] = useState<DispositivoCompra[]>([]);
  const [comprasManuales, setComprasManuales] = useState<CompraManual[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Preferencia de "ocultar montos" (ojito), recordada en este dispositivo.
  useEffect(() => {
    try {
      setOcultarMontos(window.localStorage.getItem(KEY_OCULTAR) === '1');
    } catch {}
  }, []);
  const toggleOcultar = () => {
    setOcultarMontos((v) => {
      const nuevo = !v;
      try {
        window.localStorage.setItem(KEY_OCULTAR, nuevo ? '1' : '0');
      } catch {}
      return nuevo;
    });
  };

  useEffect(() => {
    (async () => {
      try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrorCarga('No pudimos confirmar tu sesión. Volvé a entrar (en este dominio) para ver la analítica.');
        setLoading(false);
        return;
      }
      const desde = new Date();
      desde.setFullYear(desde.getFullYear() - 1);

      const [
        { data: perfil },
        { data: vend },
        { data: tec },
        cli,
        { data: prov },
        { data: ord },
        { data: items },
        { data: rep },
        { data: ing },
        { data: compras },
        { data: comprasManual },
        { data: pagosData },
        { data: creditoData },
        { data: saldosData },
      ] = await Promise.all([
        supabase.from('perfiles').select('negocios ( nombre, moneda )').eq('id', user.id).single(),
        supabase.from('vendedores').select('id, nombre, foto_url').order('nombre'),
        supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre'),
        obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido', [{ columna: 'nombre' }]),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
        supabase
          .from('ordenes')
          .select('id, vendedor_id, cliente_id, total, anticipo, monto_canje, estado, forma_pago, created_at')
          .gte('created_at', desde.toISOString()),
        supabase.from('orden_items').select('orden_id, cantidad, precio_unitario, costo, created_at').gte('created_at', desde.toISOString()),
        supabase.from('reparaciones').select('tecnico_id, fecha_reparado').not('fecha_reparado', 'is', null).gte('fecha_reparado', desde.toISOString()),
        supabase
          .from('reparaciones')
          .select('cliente_id, fecha_ingreso_servicio')
          .not('cliente_id', 'is', null)
          .not('fecha_ingreso_servicio', 'is', null)
          .gte('fecha_ingreso_servicio', desde.toISOString()),
        supabase.from('dispositivos').select('proveedor_id, costo, created_at').not('proveedor_id', 'is', null).gte('created_at', desde.toISOString()),
        supabase.from('compras_proveedor').select('proveedor_id, cantidad, precio_unitario, created_at').gte('created_at', desde.toISOString()),
        supabase.from('pagos').select('medio, monto, fecha').eq('anulado', false).gte('fecha', desde.toISOString()),
        supabase.from('cta_cte_movimientos').select('concepto, tipo, monto, fecha').eq('anulado', false).gte('fecha', desde.toISOString()),
        supabase.rpc('saldos_cuenta_corriente'),
      ]);

      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMoneda(simboloMoneda(negocio.moneda));
      setNombreNegocio(negocio?.nombre ?? '');
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setClientes(cli);
      setProveedores((prov as Proveedor[]) ?? []);
      setOrdenes((ord as OrdenR[]) ?? []);
      setOrdenItems((items as (ItemR & { created_at: string })[]) ?? []);
      setReparaciones((rep as Reparacion[]) ?? []);
      setIngresosServicio((ing as IngresoServicio[]) ?? []);
      setComprasProveedor((compras as DispositivoCompra[]) ?? []);
      setComprasManuales((comprasManual as CompraManual[]) ?? []);
      setPagos((pagosData as PagoR[]) ?? []);
      setCredito((creditoData as CreditoR[]) ?? []);
      const saldos = (saldosData as { saldo: number; vencido: number }[]) ?? [];
      setPorCobrar(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.saldo) || 0), 0));
      setVencidoTotal(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.vencido) || 0), 0));
      setActualizado(new Date());
      } catch (e) {
        console.error('Analítica: no se pudieron cargar los datos', e);
        setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ahora = useMemo(() => new Date(), [actualizado]);
  const rango = useMemo(() => rangoDe(periodo, ahora), [periodo, ahora]);

  const itemsPorOrden = useMemo(() => {
    const mapa = new Map<string, ItemR[]>();
    for (const it of ordenItems) {
      const arr = mapa.get(it.orden_id) ?? [];
      arr.push(it);
      mapa.set(it.orden_id, arr);
    }
    return mapa;
  }, [ordenItems]);

  const actualB = useMemo(
    () => bloqueVentas(ordenes, itemsPorOrden, pagos, credito, rango.inicio, rango.fin),
    [ordenes, itemsPorOrden, pagos, credito, rango]
  );
  const prevB = useMemo(
    () => bloqueVentas(ordenes, itemsPorOrden, pagos, credito, rango.inicioPrev, rango.finPrev),
    [ordenes, itemsPorOrden, pagos, credito, rango]
  );

  const serie = useMemo(
    () => serieEvolucion(ordenes, itemsPorOrden, pagos, rango, metricaChart),
    [ordenes, itemsPorOrden, pagos, rango, metricaChart]
  );

  const ticket = actualB.operaciones > 0 ? actualB.ventas / actualB.operaciones : 0;
  const ticketPrev = prevB.operaciones > 0 ? prevB.ventas / prevB.operaciones : 0;
  const cobertura = actualB.ventas > 0 ? actualB.ventasConCosto / actualB.ventas : 0;

  // --- Rankings (se conservan, filtrando por el período elegido) ---
  const inicio = rango.inicio;
  const ordenesPeriodo = useMemo(
    () => ordenes.filter((o) => ESTADOS_COBRADOS.includes(o.estado) && new Date(o.created_at) >= inicio),
    [ordenes, inicio]
  );
  const nombreDe = (lista: Persona[], id: string | null, tipo: string) =>
    !id ? 'Sin asignar' : lista.find((p) => p.id === id)?.nombre ?? `${tipo} eliminado`;
  const fotoDe = (lista: Persona[], id: string | null) => (!id ? null : lista.find((p) => p.id === id)?.foto_url ?? null);

  const rankingVendedores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) mapa.set(o.vendedor_id ?? '-', (mapa.get(o.vendedor_id ?? '-') ?? 0) + montoVenta(o));
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreDe(vendedores, id === '-' ? null : id, 'Vendedor'), fotoUrl: fotoDe(vendedores, id === '-' ? null : id), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [ordenesPeriodo, vendedores]);

  const rankingTecnicos: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of reparaciones.filter((r) => new Date(r.fecha_reparado) >= inicio)) mapa.set(r.tecnico_id ?? '-', (mapa.get(r.tecnico_id ?? '-') ?? 0) + 1);
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreDe(tecnicos, id === '-' ? null : id, 'Técnico'), fotoUrl: fotoDe(tecnicos, id === '-' ? null : id), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [reparaciones, tecnicos, inicio]);

  const nombreClienteDe = (id: string | null) => {
    if (!id) return 'Sin cliente';
    const c = clientes.find((c) => c.id === id);
    return c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Cliente eliminado';
  };

  const rankingCompradores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      if (!o.cliente_id) continue;
      mapa.set(o.cliente_id, (mapa.get(o.cliente_id) ?? 0) + montoVenta(o));
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreClienteDe(id), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [ordenesPeriodo, clientes]);

  const rankingClientesServicio: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of ingresosServicio.filter((i) => new Date(i.fecha_ingreso_servicio) >= inicio)) {
      if (!i.cliente_id) continue;
      mapa.set(i.cliente_id, (mapa.get(i.cliente_id) ?? 0) + 1);
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreClienteDe(id), valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [ingresosServicio, clientes, inicio]);

  const cajaPorMedio: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pagos.filter((p) => new Date(p.fecha) >= inicio)) mapa.set(p.medio, (mapa.get(p.medio) ?? 0) + (p.monto || 0));
    return Array.from(mapa.entries())
      .map(([medio, valor]) => ({ nombre: medioLabel(medio), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [pagos, inicio]);

  const rankingProveedores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of comprasProveedor.filter((d) => new Date(d.created_at) >= inicio)) {
      if (!d.proveedor_id) continue;
      mapa.set(d.proveedor_id, (mapa.get(d.proveedor_id) ?? 0) + (d.costo || 0));
    }
    for (const c of comprasManuales.filter((c) => new Date(c.created_at) >= inicio)) mapa.set(c.proveedor_id, (mapa.get(c.proveedor_id) ?? 0) + (c.precio_unitario || 0) * c.cantidad);
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: proveedores.find((p) => p.id === id)?.nombre ?? 'Proveedor eliminado', valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [comprasProveedor, comprasManuales, proveedores, inicio]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando analítica...</p>
      </main>
    );
  }

  if (!puedeVerEstadisticas) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver Estadísticas.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  const m = (n: number) => formatMoneda(n, moneda);
  const hora = actualizado ? actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

  const metricasChart: { key: MetricaSerie; label: string }[] = [
    { key: 'ventas', label: 'Ventas' },
    { key: 'ingresado', label: 'Dinero ingresado' },
    ...(puedeVerCostos ? ([{ key: 'ganancia', label: 'Ganancia' }] as const) : []),
  ];

  return (
    <main className="flex min-h-screen flex-col px-4 sm:px-6 py-6 gap-5 max-w-[1360px] mx-auto w-full">
      {/* Encabezado */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-2xl leading-none">
            &larr;
          </Link>
          <div>
            <h1 className="text-2xl font-display font-semibold leading-tight">Analítica del negocio</h1>
            <p className="text-sm text-muted dark:text-dark-text-secondary">
              Rendimiento de {nombreNegocio || 'tu negocio'} · {ETIQUETA_PERIODO[periodo]}
              {hora && <span className="text-[11px]"> · actualizado {hora}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleOcultar}
            aria-pressed={ocultarMontos}
            title={ocultarMontos ? 'Mostrar montos' : 'Ocultar montos'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
          >
            <span aria-hidden>{ocultarMontos ? '🙈' : '👁️'}</span>
            {ocultarMontos ? 'Mostrar' : 'Ocultar'} montos
          </button>
          <button
            onClick={exportarResumen(actualB, ticket, porCobrar, vencidoTotal, periodo, moneda, puedeVerCostos)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
          >
            <span aria-hidden>⬇️</span> Exportar
          </button>
        </div>
      </header>

      {errorCarga && (
        <div className="rounded-xl bg-bad/10 border border-bad/30 text-bad px-4 py-3 text-sm">{errorCarga}</div>
      )}

      <AnalyticsTabs valor={tab} tabs={TABS} onChange={setTab} />

      {tab !== 'resumen' ? (
        <SeccionCard titulo={TABS.find((t) => t.key === tab)?.label ?? ''}>
          <EmptyState
            icono="🚧"
            titulo="En construcción"
            texto="Esta sección va a tener su análisis dedicado en la próxima etapa. Por ahora, todo el resumen del negocio está en la pestaña Resumen."
          />
        </SeccionCard>
      ) : (
        <>
          {/* Filtros: período + comparar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedChips valor={periodo} opciones={PERIODOS} onChange={setPeriodo} />
            <label className="flex items-center gap-2 text-xs text-muted dark:text-dark-text-secondary cursor-pointer">
              <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="h-4 w-4 accent-ink" />
              Comparar con {ETIQUETA_PERIODO_ANT[periodo]}
            </label>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard
              etiqueta="Ventas netas"
              valor={m(actualB.ventas)}
              tooltip="Todo lo que facturaste en el período (incluye lo que se vendió a cuenta corriente/fiado)."
              variacion={comparar ? variacion(actualB.ventas, prevB.ventas) : undefined}
              moneda={moneda}
              sensible
              oculto={ocultarMontos}
            />
            {puedeVerCostos && (
              <StatCard
                etiqueta="Ganancia bruta"
                valor={m(actualB.ganancia)}
                tooltip={`Precio de venta menos costo, en lo que tiene costo cargado (${Math.round(cobertura * 100)}% de las ventas del período). El resto no se puede calcular sin costo.`}
                variacion={comparar ? variacion(actualB.ganancia, prevB.ganancia) : undefined}
                moneda={moneda}
                tono="text-good"
                sensible
                oculto={ocultarMontos}
              />
            )}
            <StatCard
              etiqueta="Dinero ingresado"
              valor={m(actualB.ingresado)}
              tooltip="La plata que realmente entró a la caja en el período (puede incluir cobros de ventas anteriores fiadas)."
              variacion={comparar ? variacion(actualB.ingresado, prevB.ingresado) : undefined}
              moneda={moneda}
              sensible
              oculto={ocultarMontos}
            />
            <StatCard
              etiqueta="Saldo por cobrar"
              valor={m(porCobrar)}
              tooltip="Lo que hoy te deben tus clientes en total (deuda actual, no del período)."
              tono={vencidoTotal > 0 ? 'text-warn' : undefined}
              sensible
              oculto={ocultarMontos}
            >
              {vencidoTotal > 0 && (
                <span className="text-[11px] text-bad font-medium">{ocultarMontos ? '' : `${m(vencidoTotal)} vencidos`}</span>
              )}
            </StatCard>
            <StatCard
              etiqueta="Operaciones"
              valor={actualB.operaciones.toLocaleString('es-AR')}
              tooltip="Cantidad de ventas cobradas en el período."
              variacion={comparar ? variacion(actualB.operaciones, prevB.operaciones) : undefined}
            />
            <StatCard
              etiqueta="Ticket promedio"
              valor={m(ticket)}
              tooltip="Promedio facturado por operación (ventas ÷ operaciones)."
              variacion={comparar ? variacion(ticket, ticketPrev) : undefined}
              moneda={moneda}
              sensible
              oculto={ocultarMontos}
            />
          </div>

          {/* Gráfico principal */}
          <SeccionCard
            titulo="Evolución"
            subtitulo={comparar ? `Línea llena: ${ETIQUETA_PERIODO[periodo]}. Punteada: ${ETIQUETA_PERIODO_ANT[periodo]}.` : undefined}
            accion={<SegmentedChips size="sm" valor={metricaChart} opciones={metricasChart} onChange={setMetricaChart} />}
          >
            {ocultarMontos ? (
              <EmptyState icono="🙈" titulo="Montos ocultos" texto="Tocá 'Mostrar montos' arriba para ver el gráfico." />
            ) : (
              <LineAreaChart puntos={serie} moneda={moneda} compararActivo={comparar} />
            )}
          </SeccionCard>

          {/* Rankings (se conservan; se rediseñan en detalle en la próxima etapa) */}
          <div className="grid md:grid-cols-2 gap-4">
            <SeccionCard titulo="Ranking de vendedores" accion={<VistaToggle vista={vistaVendedores} onVista={setVistaVendedores} />}>
              {vistaVendedores === 'barras' ? <RankingBarras datos={rankingVendedores} moneda={moneda} /> : <RankingTorta datos={rankingVendedores} moneda={moneda} />}
            </SeccionCard>
            <SeccionCard titulo="Caja por medio de pago" accion={<VistaToggle vista={vistaFormaPago} onVista={setVistaFormaPago} />}>
              {vistaFormaPago === 'barras' ? <RankingBarras datos={cajaPorMedio} moneda={moneda} /> : <RankingTorta datos={cajaPorMedio} moneda={moneda} />}
            </SeccionCard>
            <SeccionCard titulo="Ranking de técnicos" accion={<VistaToggle vista={vistaTecnicos} onVista={setVistaTecnicos} />}>
              {vistaTecnicos === 'barras' ? <RankingBarras datos={rankingTecnicos} sufijo=" arreglo(s)" /> : <RankingTorta datos={rankingTecnicos} sufijo=" arreglo(s)" />}
            </SeccionCard>
            <SeccionCard titulo="Mejores compradores" accion={<VistaToggle vista={vistaCompradores} onVista={setVistaCompradores} />}>
              {vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} />}
            </SeccionCard>
            <SeccionCard titulo="Clientes de servicio técnico" accion={<VistaToggle vista={vistaClientesServicio} onVista={setVistaClientesServicio} />}>
              {vistaClientesServicio === 'barras' ? <RankingBarras datos={rankingClientesServicio} sufijo=" equipo(s)" /> : <RankingTorta datos={rankingClientesServicio} sufijo=" equipo(s)" />}
            </SeccionCard>
            {rankingProveedores.length > 0 && (
              <SeccionCard titulo="Compras a proveedores" accion={<VistaToggle vista={vistaProveedores} onVista={setVistaProveedores} />}>
                {vistaProveedores === 'barras' ? <RankingBarras datos={rankingProveedores} moneda={moneda} /> : <RankingTorta datos={rankingProveedores} moneda={moneda} />}
              </SeccionCard>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function VistaToggle({ vista, onVista }: { vista: VistaRanking; onVista: (v: VistaRanking) => void }) {
  return (
    <SegmentedChips
      size="sm"
      valor={vista}
      opciones={[
        { key: 'barras', label: 'Barras' },
        { key: 'torta', label: 'Torta' },
      ]}
      onChange={onVista}
    />
  );
}

// Exporta un CSV chico con los números del resumen (los sensibles solo si el
// usuario puede ver costos). Devuelve el handler para el onClick.
function exportarResumen(
  b: { ventas: number; ganancia: number; ingresado: number; credito: number; operaciones: number },
  ticket: number,
  porCobrar: number,
  vencido: number,
  periodo: Periodo,
  moneda: string,
  puedeVerCostos: boolean
) {
  return () => {
    const filas: [string, string][] = [
      ['Período', ETIQUETA_PERIODO[periodo]],
      ['Ventas netas', String(Math.round(b.ventas))],
      ...(puedeVerCostos ? ([['Ganancia bruta', String(Math.round(b.ganancia))]] as [string, string][]) : []),
      ['Dinero ingresado', String(Math.round(b.ingresado))],
      ['Crédito otorgado', String(Math.round(b.credito))],
      ['Saldo por cobrar', String(Math.round(porCobrar))],
      ['Saldo vencido', String(Math.round(vencido))],
      ['Operaciones', String(b.operaciones)],
      ['Ticket promedio', String(Math.round(ticket))],
    ];
    const csv = `Métrica,Valor (${moneda})\n` + filas.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analitica-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
}
