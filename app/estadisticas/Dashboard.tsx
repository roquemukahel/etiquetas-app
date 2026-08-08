'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
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
type StockR = { modelo: string | null; precio: number | null; costo: number | null; en_stock_desde: string | null };

const KEY_OCULTAR = 'qovento:analitica-ocultar-montos';

export default function Estadisticas() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');
  // Ganancia/costos queda apagado en esta etapa de prueba: depende de capturar
  // orden_items.costo (su SQL + el permiso "ver_costos"), que se suma recién en
  // la fase siguiente. Con esto en false, la tarjeta de "Ganancia bruta" y la
  // métrica de ganancia del gráfico no se muestran (nada de "$0" engañoso).
  const puedeVerCostos = false;

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
  // Solo los nombres de los clientes que aparecen en órdenes/reparaciones del
  // período (no los 6000+ clientes enteros), para no saturar la carga.
  const [nombresClientes, setNombresClientes] = useState<Map<string, string>>(new Map());
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenR[]>([]);
  const [ordenItems, setOrdenItems] = useState<(ItemR & { created_at: string })[]>([]);
  const [pagos, setPagos] = useState<PagoR[]>([]);
  const [credito, setCredito] = useState<CreditoR[]>([]);
  const [porCobrar, setPorCobrar] = useState(0);
  const [vencidoTotal, setVencidoTotal] = useState(0);
  const [deudores, setDeudores] = useState(0);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [ingresosServicio, setIngresosServicio] = useState<IngresoServicio[]>([]);
  const [comprasProveedor, setComprasProveedor] = useState<DispositivoCompra[]>([]);
  const [comprasManuales, setComprasManuales] = useState<CompraManual[]>([]);
  // Stock ACTUAL (foto de hoy, no depende del período): capital, antigüedad, por modelo.
  const [stock, setStock] = useState<StockR[]>([]);
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
        { data: stockData },
      ] = await Promise.all([
        supabase.from('perfiles').select('negocios ( nombre, moneda )').eq('id', user.id).single(),
        supabase.from('vendedores').select('id, nombre, foto_url').order('nombre'),
        supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre'),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
        supabase
          .from('ordenes')
          .select('id, vendedor_id, cliente_id, total, anticipo, monto_canje, estado, forma_pago, created_at')
          .gte('created_at', desde.toISOString()),
        // "costo" se omite a propósito: la columna orden_items.costo todavía no
        // existe en producción (llega con la fase de costos). Sin esto, el
        // pedido fallaría y nos quedaríamos sin unidades/ítems. precio_unitario
        // y cantidad sí existen desde siempre.
        supabase.from('orden_items').select('orden_id, cantidad, precio_unitario, created_at').gte('created_at', desde.toISOString()),
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
        supabase.from('dispositivos').select('modelo, precio, costo, en_stock_desde').eq('en_stock', true),
      ]);

      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMoneda(simboloMoneda(negocio.moneda));
      setNombreNegocio(negocio?.nombre ?? '');
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setProveedores((prov as Proveedor[]) ?? []);
      setOrdenes((ord as OrdenR[]) ?? []);
      setOrdenItems((items as (ItemR & { created_at: string })[]) ?? []);
      setReparaciones((rep as Reparacion[]) ?? []);
      setIngresosServicio((ing as IngresoServicio[]) ?? []);
      setComprasProveedor((compras as DispositivoCompra[]) ?? []);
      setComprasManuales((comprasManual as CompraManual[]) ?? []);
      setStock((stockData as StockR[]) ?? []);
      setPagos((pagosData as PagoR[]) ?? []);
      setCredito((creditoData as CreditoR[]) ?? []);
      const saldos = (saldosData as { saldo: number; vencido: number }[]) ?? [];
      setPorCobrar(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.saldo) || 0), 0));
      setVencidoTotal(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.vencido) || 0), 0));
      setDeudores(saldos.filter((s) => (Number(s.saldo) || 0) > 0).length);

      // Nombres SOLO de los clientes que aparecen en órdenes/servicio (no los
      // miles). Un pedido acotado por ids en vez de traer toda la tabla.
      const idsClientes = Array.from(
        new Set(
          [
            ...((ord as OrdenR[]) ?? []).map((o) => o.cliente_id),
            ...((ing as IngresoServicio[]) ?? []).map((i) => i.cliente_id),
          ].filter(Boolean) as string[]
        )
      );
      const nombres = new Map<string, string>();
      for (let i = 0; i < idsClientes.length; i += 300) {
        const { data: cs } = await supabase.from('clientes').select('id, nombre, apellido').in('id', idsClientes.slice(i, i + 300));
        for (const c of (cs as Cliente[] | null) ?? []) nombres.set(c.id, `${c.nombre} ${c.apellido || ''}`.trim());
      }
      setNombresClientes(nombres);

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
  // Serie fija de "dinero ingresado" (para la pestaña Caja, sin depender del
  // selector de métrica del Resumen).
  const serieIngresado = useMemo(
    () => serieEvolucion(ordenes, itemsPorOrden, pagos, rango, 'ingresado'),
    [ordenes, itemsPorOrden, pagos, rango]
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
    return nombresClientes.get(id) ?? 'Cliente eliminado';
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
  }, [ordenesPeriodo, nombresClientes]);

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
  }, [ingresosServicio, nombresClientes, inicio]);

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

  // --- Derivados por pestaña ---
  const pctFiado = actualB.ventas > 0 ? actualB.credito / actualB.ventas : 0;
  const contado = Math.max(0, actualB.ventas - actualB.credito);

  const comprasPeriodo = useMemo(() => {
    const disp = comprasProveedor.filter((d) => new Date(d.created_at) >= inicio).reduce((a, d) => a + (d.costo || 0), 0);
    const man = comprasManuales.filter((c) => new Date(c.created_at) >= inicio).reduce((a, c) => a + (c.precio_unitario || 0) * c.cantidad, 0);
    const cant = comprasProveedor.filter((d) => new Date(d.created_at) >= inicio).length + comprasManuales.filter((c) => new Date(c.created_at) >= inicio).reduce((a, c) => a + c.cantidad, 0);
    return { total: disp + man, cantidad: cant };
  }, [comprasProveedor, comprasManuales, inicio]);

  const servicioIngresados = useMemo(() => ingresosServicio.filter((i) => new Date(i.fecha_ingreso_servicio) >= inicio).length, [ingresosServicio, inicio]);
  const servicioReparados = useMemo(() => reparaciones.filter((r) => new Date(r.fecha_reparado) >= inicio).length, [reparaciones, inicio]);

  const clientesQueCompraron = useMemo(() => new Set(ordenesPeriodo.map((o) => o.cliente_id).filter(Boolean)).size, [ordenesPeriodo]);
  const opsSinCliente = useMemo(() => ordenesPeriodo.filter((o) => !o.cliente_id).length, [ordenesPeriodo]);

  // Tabla de rendimiento por vendedor (ventas · operaciones · ticket).
  const tablaVendedores = useMemo(() => {
    const mapa = new Map<string, { ventas: number; ops: number }>();
    for (const o of ordenesPeriodo) {
      const k = o.vendedor_id ?? '-';
      const e = mapa.get(k) ?? { ventas: 0, ops: 0 };
      e.ventas += montoVenta(o);
      e.ops += 1;
      mapa.set(k, e);
    }
    return Array.from(mapa.entries())
      .map(([id, e]) => ({
        nombre: nombreDe(vendedores, id === '-' ? null : id, 'Vendedor'),
        fotoUrl: fotoDe(vendedores, id === '-' ? null : id),
        ventas: e.ventas,
        ops: e.ops,
        ticket: e.ops > 0 ? e.ventas / e.ops : 0,
      }))
      .sort((a, b) => b.ventas - a.ventas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenesPeriodo, vendedores]);

  // Stock actual (snapshot de hoy — no depende del período).
  const stockResumen = useMemo(() => {
    const hace30 = new Date(ahora);
    hace30.setDate(hace30.getDate() - 30);
    return {
      unidades: stock.length,
      capitalPrecio: stock.reduce((a, d) => a + (d.precio || 0), 0),
      capitalCosto: stock.reduce((a, d) => a + (d.costo || 0), 0),
      quietos: stock.filter((d) => d.en_stock_desde && new Date(d.en_stock_desde) <= hace30).length,
      sinPrecio: stock.filter((d) => d.precio == null).length,
    };
  }, [stock, ahora]);
  const stockPorModelo: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of stock) mapa.set(d.modelo || 'Sin modelo', (mapa.get(d.modelo || 'Sin modelo') ?? 0) + 1);
    return Array.from(mapa.entries())
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [stock]);

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

  const etiquetaPeriodo = ETIQUETA_PERIODO[periodo];
  const graficoOculto = (
    <EmptyState icono="🙈" titulo="Montos ocultos" texto="Tocá 'Mostrar montos' arriba para ver el gráfico." />
  );

  // Filtros de período + comparación (aplican a todas las pestañas salvo Stock,
  // que es una foto del inventario de hoy).
  const filtros = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedChips valor={periodo} opciones={PERIODOS} onChange={setPeriodo} />
      <label className="flex items-center gap-2 text-xs text-muted dark:text-dark-text-secondary cursor-pointer">
        <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="h-4 w-4 accent-ink" />
        Comparar con {ETIQUETA_PERIODO_ANT[periodo]}
      </label>
    </div>
  );

  const varSi = (a: number, b: number) => (comparar ? variacion(a, b) : undefined);

  function renderContenido() {
    switch (tab) {
      case 'ventas':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Ventas netas" valor={m(actualB.ventas)} tooltip="Todo lo que facturaste en el período (incluye lo vendido a cuenta corriente/fiado)." variacion={varSi(actualB.ventas, prevB.ventas)} moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Operaciones" valor={actualB.operaciones.toLocaleString('es-AR')} tooltip="Cantidad de ventas cobradas en el período." variacion={varSi(actualB.operaciones, prevB.operaciones)} />
              <StatCard etiqueta="Ticket promedio" valor={m(ticket)} tooltip="Promedio facturado por operación (ventas ÷ operaciones)." variacion={varSi(ticket, ticketPrev)} moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Unidades vendidas" valor={actualB.unidades.toLocaleString('es-AR')} tooltip="Dispositivos y productos vendidos en el período." variacion={varSi(actualB.unidades, prevB.unidades)} />
              <StatCard etiqueta="Vendido al contado" valor={m(contado)} tooltip="Ventas del período que NO se financiaron en cuenta corriente." moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Vendido a crédito" valor={m(actualB.credito)} tooltip="Ventas que quedaron fiadas (cuenta corriente) en el período." moneda={moneda} tono={actualB.credito > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos}>
                {!ocultarMontos && actualB.ventas > 0 && <span className="text-[11px] text-muted dark:text-dark-text-secondary">{Math.round(pctFiado * 100)}% de las ventas</span>}
              </StatCard>
            </div>
            <SeccionCard titulo="Evolución de ventas" subtitulo={comparar ? `Línea llena: ${etiquetaPeriodo}. Punteada: ${ETIQUETA_PERIODO_ANT[periodo]}.` : undefined} accion={<SegmentedChips size="sm" valor={metricaChart} opciones={metricasChart} onChange={setMetricaChart} />}>
              {ocultarMontos ? graficoOculto : <LineAreaChart puntos={serie} moneda={moneda} compararActivo={comparar} />}
            </SeccionCard>
            <div className="grid md:grid-cols-2 gap-4">
              <SeccionCard titulo="Ranking de vendedores" accion={<VistaToggle vista={vistaVendedores} onVista={setVistaVendedores} />}>
                {vistaVendedores === 'barras' ? <RankingBarras datos={rankingVendedores} moneda={moneda} /> : <RankingTorta datos={rankingVendedores} moneda={moneda} />}
              </SeccionCard>
              <SeccionCard titulo="Mejores compradores" accion={<VistaToggle vista={vistaCompradores} onVista={setVistaCompradores} />}>
                {vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} />}
              </SeccionCard>
            </div>
          </>
        );

      case 'caja':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Dinero ingresado" valor={m(actualB.ingresado)} tooltip="La plata que realmente entró a la caja en el período (incluye cobros de ventas anteriores fiadas)." variacion={varSi(actualB.ingresado, prevB.ingresado)} moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Medios de pago" valor={cajaPorMedio.length.toLocaleString('es-AR')} tooltip="Cantidad de formas de pago distintas usadas en el período." />
              <StatCard etiqueta="Vendido a crédito" valor={m(actualB.credito)} tooltip="Lo que se sumó a cuentas corrientes en el período (todavía no entró a la caja)." moneda={moneda} tono={actualB.credito > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos} />
            </div>
            <SeccionCard titulo="Evolución del dinero ingresado" subtitulo={comparar ? `Línea llena: ${etiquetaPeriodo}. Punteada: ${ETIQUETA_PERIODO_ANT[periodo]}.` : undefined}>
              {ocultarMontos ? graficoOculto : <LineAreaChart puntos={serieIngresado} moneda={moneda} compararActivo={comparar} />}
            </SeccionCard>
            <SeccionCard titulo="Caja por medio de pago" accion={<VistaToggle vista={vistaFormaPago} onVista={setVistaFormaPago} />}>
              {cajaPorMedio.length === 0 ? (
                <EmptyState titulo="Sin cobros en el período" texto="Cuando registres pagos, vas a ver acá cómo se reparten por medio." />
              ) : vistaFormaPago === 'barras' ? (
                <RankingBarras datos={cajaPorMedio} moneda={moneda} />
              ) : (
                <RankingTorta datos={cajaPorMedio} moneda={moneda} />
              )}
            </SeccionCard>
          </>
        );

      case 'cobrar':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Saldo por cobrar" valor={m(porCobrar)} tooltip="Lo que hoy te deben tus clientes en total (deuda actual, no del período)." tono={vencidoTotal > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Vencido" valor={m(vencidoTotal)} tooltip="De lo que te deben, cuánto ya pasó su fecha de vencimiento." tono={vencidoTotal > 0 ? 'text-bad' : undefined} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Fiado en el período" valor={m(actualB.credito)} tooltip="Cuánto sumaste a cuentas corrientes en el período elegido." variacion={varSi(actualB.credito, prevB.credito)} positivoEsBueno={false} moneda={moneda} sensible oculto={ocultarMontos} />
            </div>
            <SeccionCard titulo="Cuentas por cobrar">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted dark:text-dark-text-secondary">
                  {vencidoTotal > 0
                    ? `Tenés ${m(vencidoTotal)} vencidos sobre ${m(porCobrar)} por cobrar. Conviene reclamar los vencidos primero.`
                    : porCobrar > 0
                      ? `Te deben ${m(porCobrar)} en total y no hay saldo vencido. Todo al día.`
                      : 'No hay saldos pendientes de cobro.'}
                </p>
                <Link href="/cuentas-por-cobrar" className="self-start rounded-xl bg-accent dark:bg-dark-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors">
                  Ver quién te debe →
                </Link>
              </div>
            </SeccionCard>
          </>
        );

      case 'stock':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Equipos en stock" valor={stockResumen.unidades.toLocaleString('es-AR')} tooltip="Dispositivos disponibles para vender ahora mismo." />
              <StatCard etiqueta="Capital en stock" valor={m(stockResumen.capitalPrecio)} tooltip="Suma de los precios de venta de todo el stock actual." moneda={moneda} sensible oculto={ocultarMontos} />
              {puedeVerCostos && <StatCard etiqueta="Capital a costo" valor={m(stockResumen.capitalCosto)} tooltip="Lo que te costó el stock que tenés (a precio de compra)." moneda={moneda} sensible oculto={ocultarMontos} />}
              <StatCard etiqueta="Parados +30 días" valor={stockResumen.quietos.toLocaleString('es-AR')} tooltip="Equipos que llevan más de 30 días sin venderse." tono={stockResumen.quietos > 0 ? 'text-warn' : undefined} />
              <StatCard etiqueta="Sin precio" valor={stockResumen.sinPrecio.toLocaleString('es-AR')} tooltip="Equipos cargados sin precio de venta (no se pueden vender así)." tono={stockResumen.sinPrecio > 0 ? 'text-warn' : undefined} />
            </div>
            <SeccionCard titulo="Stock por modelo" subtitulo="Foto del inventario de hoy (no depende del período).">
              {stockPorModelo.length === 0 ? <EmptyState titulo="Sin equipos en stock" /> : <RankingBarras datos={stockPorModelo} sufijo=" equipo(s)" />}
            </SeccionCard>
          </>
        );

      case 'servicio':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Equipos ingresados" valor={servicioIngresados.toLocaleString('es-AR')} tooltip="Equipos que entraron a Servicio Técnico en el período." />
              <StatCard etiqueta="Equipos reparados" valor={servicioReparados.toLocaleString('es-AR')} tooltip="Reparaciones terminadas en el período." tono="text-good" />
              <StatCard etiqueta="Técnicos activos" valor={rankingTecnicos.length.toLocaleString('es-AR')} tooltip="Técnicos con al menos un arreglo terminado en el período." />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <SeccionCard titulo="Ranking de técnicos" accion={<VistaToggle vista={vistaTecnicos} onVista={setVistaTecnicos} />}>
                {rankingTecnicos.length === 0 ? <EmptyState titulo="Sin reparaciones terminadas" /> : vistaTecnicos === 'barras' ? <RankingBarras datos={rankingTecnicos} sufijo=" arreglo(s)" /> : <RankingTorta datos={rankingTecnicos} sufijo=" arreglo(s)" />}
              </SeccionCard>
              <SeccionCard titulo="Clientes de servicio técnico" accion={<VistaToggle vista={vistaClientesServicio} onVista={setVistaClientesServicio} />}>
                {rankingClientesServicio.length === 0 ? <EmptyState titulo="Sin ingresos de servicio" /> : vistaClientesServicio === 'barras' ? <RankingBarras datos={rankingClientesServicio} sufijo=" equipo(s)" /> : <RankingTorta datos={rankingClientesServicio} sufijo=" equipo(s)" />}
              </SeccionCard>
            </div>
          </>
        );

      case 'clientes':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Clientes que compraron" valor={clientesQueCompraron.toLocaleString('es-AR')} tooltip="Clientes distintos con al menos una compra en el período." />
              <StatCard etiqueta="Ventas sin cliente" valor={opsSinCliente.toLocaleString('es-AR')} tooltip="Operaciones del período que no quedaron asociadas a un cliente." tono={opsSinCliente > 0 ? 'text-warn' : undefined} />
              <StatCard etiqueta="Clientes que deben" valor={deudores.toLocaleString('es-AR')} tooltip="Clientes con saldo pendiente en su cuenta corriente (a hoy)." tono={deudores > 0 ? 'text-warn' : undefined} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <SeccionCard titulo="Mejores compradores" accion={<VistaToggle vista={vistaCompradores} onVista={setVistaCompradores} />}>
                {rankingCompradores.length === 0 ? <EmptyState titulo="Sin compras en el período" /> : vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} />}
              </SeccionCard>
              <SeccionCard titulo="Clientes de servicio técnico" accion={<VistaToggle vista={vistaClientesServicio} onVista={setVistaClientesServicio} />}>
                {rankingClientesServicio.length === 0 ? <EmptyState titulo="Sin ingresos de servicio" /> : vistaClientesServicio === 'barras' ? <RankingBarras datos={rankingClientesServicio} sufijo=" equipo(s)" /> : <RankingTorta datos={rankingClientesServicio} sufijo=" equipo(s)" />}
              </SeccionCard>
            </div>
          </>
        );

      case 'equipo':
        return (
          <>
            <SeccionCard titulo="Rendimiento por vendedor" subtitulo={`Ventas de ${etiquetaPeriodo}.`}>
              {tablaVendedores.length === 0 ? (
                <EmptyState titulo="Sin ventas en el período" />
              ) : (
                <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-2 text-[11px] font-medium text-muted dark:text-dark-text-secondary">
                    <span>Vendedor</span>
                    <span className="text-right w-20">Operac.</span>
                    <span className="text-right w-28">Ventas</span>
                  </div>
                  {tablaVendedores.map((v, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 items-center text-sm">
                      <span className="truncate">{v.nombre}</span>
                      <span className="text-right w-20 tabular-nums">{v.ops.toLocaleString('es-AR')}</span>
                      <span className="text-right w-28 tabular-nums font-medium">{ocultarMontos ? '••••' : m(v.ventas)}</span>
                    </div>
                  ))}
                </div>
              )}
            </SeccionCard>
            <SeccionCard titulo="Ranking de técnicos" accion={<VistaToggle vista={vistaTecnicos} onVista={setVistaTecnicos} />}>
              {rankingTecnicos.length === 0 ? <EmptyState titulo="Sin reparaciones terminadas" /> : vistaTecnicos === 'barras' ? <RankingBarras datos={rankingTecnicos} sufijo=" arreglo(s)" /> : <RankingTorta datos={rankingTecnicos} sufijo=" arreglo(s)" />}
            </SeccionCard>
          </>
        );

      case 'proveedores':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Comprado en el período" valor={m(comprasPeriodo.total)} tooltip="Total gastado en compras a proveedores (dispositivos + compras manuales) en el período." moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Unidades compradas" valor={comprasPeriodo.cantidad.toLocaleString('es-AR')} tooltip="Cantidad de equipos/ítems comprados a proveedores en el período." />
              <StatCard etiqueta="Proveedores activos" valor={rankingProveedores.length.toLocaleString('es-AR')} tooltip="Proveedores a los que les compraste en el período." />
            </div>
            <SeccionCard titulo="Compras por proveedor" accion={<VistaToggle vista={vistaProveedores} onVista={setVistaProveedores} />}>
              {rankingProveedores.length === 0 ? <EmptyState titulo="Sin compras en el período" texto="Cuando cargues compras a proveedores, vas a ver el detalle acá." /> : vistaProveedores === 'barras' ? <RankingBarras datos={rankingProveedores} moneda={moneda} /> : <RankingTorta datos={rankingProveedores} moneda={moneda} />}
            </SeccionCard>
          </>
        );

      default:
        return null;
    }
  }

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

      {/* Filtros de período (no aplican a Stock, que es la foto de hoy). */}
      {tab !== 'stock' && filtros}

      {tab === 'resumen' ? (
        <>

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
      ) : (
        renderContenido()
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
