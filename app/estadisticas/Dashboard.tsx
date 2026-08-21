'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerTodasLasFilas } from '../lib/db';
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
  resumenFinanciacionDe,
  resumenComisionesDe,
  egresosPeriodoDe,
  PlanFinR,
  CuotaFinR,
  PagoFinR,
  ComisionMovR,
  EgresoR,
} from './datos';
import { StatCard, SeccionCard, EmptyState, SegmentedChips, AnalyticsTabs, formatMoneda } from './ui';
import { LineAreaChart } from './charts';
import { QCard } from '../QCard';
import { QoviState } from '../QoviState';
import CampoFecha from '../CampoFecha';

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

const ETIQUETA_PERIODO: Record<Periodo, string> = { hoy: 'hoy', semana: 'esta semana', mes: 'este mes', anio: 'este año' };
const ETIQUETA_PERIODO_ANT: Record<Periodo, string> = {
  hoy: 'ayer',
  semana: 'la semana anterior',
  mes: 'el mes anterior',
  anio: 'el año anterior',
};

// Fecha en formato yyyy-mm-dd para CampoFecha, usando los
// componentes LOCALES (no toISOString(), que es UTC y puede correr un día
// para atrás/adelante según la hora y el huso horario).
function aFechaInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

// Texto legible del tramo exacto que se está mirando (para saber, al
// navegar, si es "la semana del 11 al 17" o cuál específicamente).
function etiquetaTramo(periodo: Periodo, rango: { inicio: Date; fin: Date }): string {
  if (periodo === 'hoy') {
    return rango.inicio.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (periodo === 'semana') {
    const finSemana = new Date(rango.inicio);
    finSemana.setDate(finSemana.getDate() + 6);
    const mismoMes = rango.inicio.getMonth() === finSemana.getMonth();
    const desde = rango.inicio.toLocaleDateString('es-AR', mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    const hasta = finSemana.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${desde} al ${hasta}`;
  }
  if (periodo === 'mes') {
    return rango.inicio.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }
  return String(rango.inicio.getFullYear());
}

type Persona = { id: string; nombre: string; foto_url: string | null };
type Cliente = { id: string; nombre: string; apellido: string | null };
type Proveedor = { id: string; nombre: string };
type Reparacion = { tecnico_id: string | null; fecha_reparado: string };
type IngresoServicio = { cliente_id: string | null; fecha_ingreso_servicio: string };
type DispositivoCompra = { proveedor_id: string | null; costo: number | null; created_at: string };
type CompraManual = { proveedor_id: string; cantidad: number; precio_unitario: number | null; created_at: string };
type StockR = { modelo: string | null; precio: number | null; costo: number | null; en_stock_desde: string | null; categoria_id: string | null };
type RegistroDispositivo = { agregado_por_nombre: string | null; agregado_por_foto_url: string | null; created_at: string };
type CategoriaStockR = { id: string; nombre: string };
type MovProveedorR = { proveedor_id: string; tipo: string; monto: number; fecha: string };

const KEY_OCULTAR = 'qovento:analitica-ocultar-montos';

export default function Estadisticas() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');
  // orden_items.costo existe en producción desde el módulo de Comisiones
  // (comisiones_supabase.sql) — acá solo faltaba pedirla y respetar el
  // permiso 'ver_costos' (accesoCompleto/administrador, igual que
  // ver_proveedores) en vez de tenerlo apagado a mano.
  const puedeVerCostos = tienePermiso(actor, 'ver_costos');
  const puedeVerEgresos = tienePermiso(actor, 'gestionar_egresos');

  const [tab, setTab] = useState<Tab>('resumen');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  // Qué día/semana/mes/año específico se está mirando — por defecto el
  // actual (arranca en "ahora", se actualiza junto con él más abajo).
  // Cambiar de período (chip Hoy/Semana/Mes/Año) vuelve siempre al tramo
  // actual, no arrastra "hace 3 semanas" al cambiar a Año sin que se note.
  const [fechaReferencia, setFechaReferencia] = useState<Date>(new Date());
  const [comparar, setComparar] = useState(true);
  const [ocultarMontos, setOcultarMontos] = useState(false);
  const [metricaChart, setMetricaChart] = useState<MetricaSerie>('ventas');

  const [vistaVendedores, setVistaVendedores] = useState<VistaRanking>('barras');
  const [vistaTecnicos, setVistaTecnicos] = useState<VistaRanking>('barras');
  const [vistaFormaPago, setVistaFormaPago] = useState<VistaRanking>('torta');
  const [vistaProveedores, setVistaProveedores] = useState<VistaRanking>('barras');
  const [vistaCompradores, setVistaCompradores] = useState<VistaRanking>('barras');
  const [vistaClientesServicio, setVistaClientesServicio] = useState<VistaRanking>('barras');
  const [vistaRegistroStock, setVistaRegistroStock] = useState<VistaRanking>('barras');

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
  // Altas de stock (quién cargó cada equipo), para el ranking por período.
  const [registrosDispositivos, setRegistrosDispositivos] = useState<RegistroDispositivo[]>([]);
  const [categoriasStock, setCategoriasStock] = useState<CategoriaStockR[]>([]);
  // Cuentas por pagar (proveedor_movimientos + saldos_proveedores) — si el
  // negocio no corrió esa migración, quedan vacíos y esas tarjetas puntuales
  // simplemente no se muestran (mismo criterio que el resto del dashboard).
  const [movsProveedor, setMovsProveedor] = useState<MovProveedorR[]>([]);
  const [saldoProveedoresTotal, setSaldoProveedoresTotal] = useState<number | null>(null);
  // Financiación propia en cuotas — si el negocio no corrió esa migración,
  // quedan vacíos y la sección no se muestra.
  const [cuotasFinanciacion, setCuotasFinanciacion] = useState<CuotaFinR[]>([]);
  const [planesFinanciacion, setPlanesFinanciacion] = useState<PlanFinR[]>([]);
  const [pagosFinanciacion, setPagosFinanciacion] = useState<PagoFinR[]>([]);
  // Comisiones — igual, opcional según si el negocio activó el módulo.
  const [comisionMovs, setComisionMovs] = useState<ComisionMovR[]>([]);
  // Egresos operativos — opcional según si el negocio ya corrió esa
  // migración. Mismo criterio de agregación (sin separar por moneda) que ya
  // usan ventas/ingresado/ganancia en este mismo dashboard.
  const [egresos, setEgresos] = useState<EgresoR[]>([]);
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
        [
          { data: perfil },
          { data: vend },
          { data: tec },
          { data: prov },
          { data: ord },
          { data: items },
          { data: rep },
          { data: ing },
          { data: comprasManual },
          { data: pagosData },
          { data: creditoData },
          { data: saldosData },
          { data: categoriasData },
          { data: movsProveedorData },
          { data: saldosProveedorData },
          { data: cuotasFinData },
          { data: planesFinData },
          { data: pagosFinData },
          { data: comisionData },
          { data: egresosData },
        ],
        // Estas 3 son de "dispositivos" aparte (no en el Promise.all de
        // arriba): con miles de dispositivos cargados, un select() común se
        // corta en 1000 filas sin avisar y las estadísticas quedarían mal
        // (capital de stock, compras del período, ranking de altas, todos
        // subestimados). obtenerTodasLasFilas pagina hasta traer todo.
        compras,
        stockData,
        registrosData,
      ] = await Promise.all([
        Promise.all([
          supabase.from('perfiles').select('negocios ( nombre, moneda )').eq('id', user.id).single(),
          supabase.from('vendedores').select('id, nombre, foto_url').order('nombre'),
          supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre'),
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
          supabase.from('compras_proveedor').select('proveedor_id, cantidad, precio_unitario, created_at').gte('created_at', desde.toISOString()),
          supabase.from('pagos').select('medio, monto, fecha').eq('anulado', false).gte('fecha', desde.toISOString()),
          supabase.from('cta_cte_movimientos').select('concepto, tipo, monto, fecha').eq('anulado', false).gte('fecha', desde.toISOString()),
          supabase.rpc('saldos_cuenta_corriente'),
          // Todas estas son opcionales — si el negocio no corrió esa
          // migración (o no activó el módulo), Supabase devuelve error y
          // "data: null" en vez de tirar excepción; los "?? []" de abajo
          // dejan la sección vacía en vez de romper toda la pantalla.
          supabase.from('stock_categorias').select('id, nombre'),
          supabase.from('proveedor_movimientos').select('proveedor_id, tipo, monto, fecha').eq('anulado', false).gte('fecha', desde.toISOString()),
          supabase.rpc('saldos_proveedores'),
          supabase.from('financiacion_cuotas').select('importe_original, importe_pagado, estado, fecha_vencimiento').neq('estado', 'anulada'),
          supabase.from('financiacion_planes').select('importe_financiado, estado, created_at'),
          supabase
            .from('financiacion_pagos')
            .select('monto_aplicado, tipo, created_at')
            .eq('tipo', 'pago')
            .gte('created_at', desde.toISOString()),
          supabase.from('comision_movimientos').select('comision, estado, fecha_hecho, created_at').neq('estado', 'revertida').gte('created_at', desde.toISOString()),
          supabase.from('egresos').select('importe, fecha').eq('anulado', false).gte('fecha', desde.toISOString().slice(0, 10)),
        ]),
        obtenerTodasLasFilas<DispositivoCompra>(supabase, 'dispositivos', 'proveedor_id, costo, created_at', [], (q) =>
          q.not('proveedor_id', 'is', null).gte('created_at', desde.toISOString())
        ),
        // Foto del inventario de HOY (no depende del período), para capital y stock por modelo.
        obtenerTodasLasFilas<StockR>(supabase, 'dispositivos', 'modelo, precio, costo, en_stock_desde, categoria_id', [], (q) => q.eq('en_stock', true)),
        // Todas las altas de stock (no solo lo que sigue en stock hoy), para
        // poder rankear quién cargó más equipos en el período.
        obtenerTodasLasFilas<RegistroDispositivo>(supabase, 'dispositivos', 'agregado_por_nombre, agregado_por_foto_url, created_at', [], (q) =>
          q.gte('created_at', desde.toISOString())
        ),
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
      setComprasProveedor(compras);
      setComprasManuales((comprasManual as CompraManual[]) ?? []);
      setStock(stockData);
      setRegistrosDispositivos(registrosData);
      setPagos((pagosData as PagoR[]) ?? []);
      setCredito((creditoData as CreditoR[]) ?? []);
      const saldos = (saldosData as { saldo: number; vencido: number }[]) ?? [];
      setPorCobrar(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.saldo) || 0), 0));
      setVencidoTotal(saldos.reduce((acc, s) => acc + Math.max(0, Number(s.vencido) || 0), 0));
      setDeudores(saldos.filter((s) => (Number(s.saldo) || 0) > 0).length);

      setCategoriasStock((categoriasData as CategoriaStockR[]) ?? []);
      setMovsProveedor((movsProveedorData as MovProveedorR[]) ?? []);
      const saldosProv = (saldosProveedorData as { proveedor_id: string; saldo: number }[]) ?? [];
      setSaldoProveedoresTotal(saldosProveedorData ? saldosProv.reduce((acc, s) => acc + Math.max(0, Number(s.saldo) || 0), 0) : null);
      setCuotasFinanciacion((cuotasFinData as CuotaFinR[]) ?? []);
      setPlanesFinanciacion((planesFinData as PlanFinR[]) ?? []);
      setPagosFinanciacion((pagosFinData as PagoFinR[]) ?? []);
      setComisionMovs((comisionData as ComisionMovR[]) ?? []);
      setEgresos((egresosData as EgresoR[]) ?? []);

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
  const rango = useMemo(() => rangoDe(periodo, ahora, fechaReferencia), [periodo, ahora, fechaReferencia]);
  // rangoDe deja fin === ahora exactamente cuando el tramo elegido es el
  // actual (parcial); si ya cerró, fin queda fijo en el final de ese tramo.
  const esPeriodoActual = rango.fin.getTime() === ahora.getTime();

  // Cambiar de chip (Hoy/Semana/Mes/Año) vuelve siempre al tramo actual —
  // si no, uno podía quedar viendo "la semana pasada" y al tocar "Mes" se
  // encontraba mirando el mes pasado sin haberlo pedido.
  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setFechaReferencia(new Date());
  };

  // Mueve la fecha de referencia un tramo hacia atrás o adelante, según el
  // período elegido (un día, una semana, un mes o un año).
  const navegarPeriodo = (direccion: -1 | 1) => {
    const nueva = new Date(fechaReferencia);
    if (periodo === 'hoy') nueva.setDate(nueva.getDate() + direccion);
    else if (periodo === 'semana') nueva.setDate(nueva.getDate() + direccion * 7);
    else if (periodo === 'mes') nueva.setMonth(nueva.getMonth() + direccion);
    else nueva.setFullYear(nueva.getFullYear() + direccion);
    setFechaReferencia(nueva);
  };

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

  // Quién registró más equipos en el stock durante el período elegido.
  const rankingRegistroStock: Dato[] = useMemo(() => {
    const mapa = new Map<string, { valor: number; fotoUrl: string | null }>();
    for (const d of registrosDispositivos.filter((d) => new Date(d.created_at) >= inicio)) {
      const nombre = d.agregado_por_nombre || 'Sin registrar';
      const e = mapa.get(nombre) ?? { valor: 0, fotoUrl: null };
      e.valor += 1;
      if (!e.fotoUrl && d.agregado_por_foto_url) e.fotoUrl = d.agregado_por_foto_url;
      mapa.set(nombre, e);
    }
    return Array.from(mapa.entries())
      .map(([nombre, e]) => ({ nombre, valor: e.valor, fotoUrl: e.fotoUrl }))
      .sort((a, b) => b.valor - a.valor);
  }, [registrosDispositivos, inicio]);

  // Stock por categoría (reutiliza stock_categorias, mismas categorías que
  // Configuración → Categorías de stock — no se inventa una agrupación nueva).
  const stockPorCategoria: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of stock) {
      const clave = d.categoria_id ?? '__sin_categoria__';
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({
        nombre: id === '__sin_categoria__' ? 'Sin categoría' : categoriasStock.find((c) => c.id === id)?.nombre ?? 'Categoría eliminada',
        valor,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [stock, categoriasStock]);

  // Pagado a proveedores en el período — reutiliza proveedor_movimientos
  // (cuentas por pagar), no se recalcula ni se inventa: mismo criterio
  // "cargo/abono" que la cuenta corriente de clientes, del otro lado.
  const pagadoProveedoresPeriodo = useMemo(
    () => movsProveedor.filter((m) => m.tipo === 'abono' && new Date(m.fecha) >= inicio).reduce((a, m) => a + (m.monto || 0), 0),
    [movsProveedor, inicio]
  );

  // Resumen de financiación propia en cuotas y de comisiones — funciones
  // puras de datos.ts (resumenFinanciacionDe/resumenComisionesDe, con sus
  // propios tests), no reimplementan los motores de esos módulos: son sumas
  // directas sobre lo que esos módulos ya persisten.
  const resumenFinanciacion = useMemo(
    () => resumenFinanciacionDe(planesFinanciacion, cuotasFinanciacion, pagosFinanciacion, inicio, rango.fin, ahora),
    [planesFinanciacion, cuotasFinanciacion, pagosFinanciacion, inicio, rango.fin, ahora]
  );
  const resumenComisiones = useMemo(() => resumenComisionesDe(comisionMovs, inicio, rango.fin), [comisionMovs, inicio, rango.fin]);

  // Egresos operativos del período (gasto operativo/retiro/ajuste/otro —
  // nunca compras ni pagos a proveedores, esos tienen sus propias tarjetas y
  // sumarlos acá los contaría dos veces). "Resultado operativo estimado" =
  // ganancia bruta − egresos operativos; solo tiene sentido si hay costo
  // cargado (si no, ganancia sería 0 falso, no "sin datos") y requiere
  // ver_costos igual que ganancia bruta.
  const egresosPeriodo = useMemo(() => egresosPeriodoDe(egresos, inicio, rango.fin), [egresos, inicio, rango.fin]);
  const hayEgresos = egresos.length > 0;
  const resultadoOperativoEstimado = actualB.ganancia - egresosPeriodo;

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

  // "esta semana"/"el mes anterior" son para el botón "Volver a..." y el
  // checkbox de comparación (frases relativas, siempre correctas). Para
  // describir QUÉ se está mirando en cada gráfico/sección se usa el tramo
  // exacto (ej. "11 al 17 de agosto"), que si no cambiaría de nombre al
  // navegar a un período pasado pero seguiría diciendo "esta semana".
  const etiquetaPeriodo = ETIQUETA_PERIODO[periodo];
  const etiquetaTramoActual = etiquetaTramo(periodo, rango);
  const etiquetaTramoAnterior = etiquetaTramo(periodo, { inicio: rango.inicioPrev, fin: rango.finPrev });
  const graficoOculto = (
    <EmptyState icono="🙈" titulo="Montos ocultos" texto="Tocá 'Mostrar montos' arriba para ver el gráfico." />
  );

  // Filtros de período + comparación (aplican a todas las pestañas salvo Stock,
  // que es una foto del inventario de hoy).
  const filtros = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedChips valor={periodo} opciones={PERIODOS} onChange={cambiarPeriodo} />
        <label className="flex items-center gap-2 text-xs text-muted dark:text-dark-text-secondary cursor-pointer">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="h-4 w-4 accent-ink" />
          Comparar con {ETIQUETA_PERIODO_ANT[periodo]}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navegarPeriodo(-1)}
          aria-label="Tramo anterior"
          className="rounded-lg border border-border dark:border-dark-border px-2.5 py-1 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
        >
          ‹
        </button>
        <span className="text-sm font-medium capitalize">{etiquetaTramo(periodo, rango)}</span>
        <button
          type="button"
          onClick={() => navegarPeriodo(1)}
          disabled={esPeriodoActual}
          aria-label="Tramo siguiente"
          className="rounded-lg border border-border dark:border-dark-border px-2.5 py-1 text-sm hover:bg-canvas dark:hover:bg-dark-bg disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ›
        </button>
        {!esPeriodoActual && (
          <button
            type="button"
            onClick={() => setFechaReferencia(new Date())}
            className="text-xs text-accent dark:text-dark-accent underline"
          >
            Volver a {etiquetaPeriodo}
          </button>
        )}
        <CampoFecha
          value={aFechaInput(fechaReferencia)}
          onChange={(iso) => setFechaReferencia(new Date(iso + 'T12:00:00'))}
          ariaLabel="Elegir una fecha específica"
          className="ml-auto"
          classNameSelect="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-1.5 py-1 text-xs"
        />
      </div>
    </div>
  );

  const varSi = (a: number, b: number) => (comparar ? variacion(a, b) : undefined);

  function renderContenido() {
    switch (tab) {
      case 'ventas': {
        const evolucionVentas = variacion(actualB.ventas, prevB.ventas);
        // No exigimos prevB.ventas > 0: si el período anterior fue $0 y este
        // no, sigue siendo una suba real (el texto ya tiene un fallback sin
        // porcentaje para ese caso, más abajo). Exigir ambos > 0 lo hacía
        // innecesariamente raro de ver.
        const ventasEnAumento = comparar && !ocultarMontos && actualB.ventas > 0 && actualB.ventas > prevB.ventas;
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Ventas netas" valor={m(actualB.ventas)} tooltip="Todo lo que facturaste en el período (incluye lo vendido a cuenta corriente/fiado)." variacion={varSi(actualB.ventas, prevB.ventas)} moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Operaciones" valor={actualB.operaciones.toLocaleString('es-AR')} tooltip="Cantidad de ventas cobradas en el período." variacion={varSi(actualB.operaciones, prevB.operaciones)} />
              <StatCard etiqueta="Ticket promedio" valor={m(ticket)} tooltip="Promedio facturado por operación (ventas ÷ operaciones)." variacion={varSi(ticket, ticketPrev)} moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Unidades vendidas" valor={actualB.unidades.toLocaleString('es-AR')} tooltip="Dispositivos y productos vendidos en el período." variacion={varSi(actualB.unidades, prevB.unidades)} />
              {puedeVerCostos && (
                <StatCard
                  etiqueta="Ganancia bruta"
                  valor={m(actualB.ganancia)}
                  tooltip={`Ventas netas menos costo histórico de venta, en lo que tiene costo cargado (${Math.round(cobertura * 100)}% de las ventas del período).`}
                  variacion={varSi(actualB.ganancia, prevB.ganancia)}
                  moneda={moneda}
                  tono="text-good"
                  sensible
                  oculto={ocultarMontos}
                >
                  {!ocultarMontos && actualB.ventasConCosto > 0 && (
                    <span className="text-[11px] text-muted dark:text-dark-text-secondary">
                      Margen {Math.round((actualB.ganancia / actualB.ventasConCosto) * 100)}%
                    </span>
                  )}
                </StatCard>
              )}
              <StatCard etiqueta="Vendido al contado" valor={m(contado)} tooltip="Ventas del período que NO se financiaron en cuenta corriente." moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Vendido a crédito" valor={m(actualB.credito)} tooltip="Ventas que quedaron fiadas (cuenta corriente) en el período." moneda={moneda} tono={actualB.credito > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos}>
                {!ocultarMontos && actualB.ventas > 0 && <span className="text-[11px] text-muted dark:text-dark-text-secondary">{Math.round(pctFiado * 100)}% de las ventas</span>}
              </StatCard>
            </div>
            {/* Qovi solo aparece acá si la comparación real (ya calculada
                arriba, sin inventar nada) da positiva — nunca decorativo.
                Va en su propia tarjeta de conclusión, no encima del gráfico
                de abajo. */}
            {ventasEnAumento && (
              <QCard firma padding="sm">
                <QoviState
                  escena="estadisticasPositivas"
                  tamano="sm"
                  alineacion="izquierda"
                  titulo="Las ventas van en alza"
                  descripcion={`${etiquetaTramoActual} vendiste ${
                    evolucionVentas.pct != null ? `${Math.abs(evolucionVentas.pct).toFixed(1).replace('.', ',')}% más` : 'más'
                  } que ${etiquetaTramoAnterior}.`}
                />
              </QCard>
            )}
            <SeccionCard titulo="Evolución de ventas" subtitulo={comparar ? `Línea llena: ${etiquetaTramoActual}. Punteada: ${etiquetaTramoAnterior}.` : undefined} accion={<SegmentedChips size="sm" valor={metricaChart} opciones={metricasChart} onChange={setMetricaChart} />}>
              {ocultarMontos ? graficoOculto : <LineAreaChart puntos={serie} moneda={moneda} compararActivo={comparar} />}
            </SeccionCard>
            <div className="grid md:grid-cols-2 gap-4">
              <SeccionCard titulo="Ranking de vendedores" accion={<VistaToggle vista={vistaVendedores} onVista={setVistaVendedores} />}>
                {vistaVendedores === 'barras' ? <RankingBarras datos={rankingVendedores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingVendedores} moneda={moneda} oculto={ocultarMontos} />}
              </SeccionCard>
              <SeccionCard titulo="Mejores compradores" accion={<VistaToggle vista={vistaCompradores} onVista={setVistaCompradores} />}>
                {vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} />}
              </SeccionCard>
            </div>
          </>
        );
      }

      case 'caja':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Dinero ingresado" valor={m(actualB.ingresado)} tooltip="La plata que realmente entró a la caja en el período (incluye cobros de ventas anteriores fiadas)." variacion={varSi(actualB.ingresado, prevB.ingresado)} moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Medios de pago" valor={cajaPorMedio.length.toLocaleString('es-AR')} tooltip="Cantidad de formas de pago distintas usadas en el período." />
              <StatCard etiqueta="Vendido a crédito" valor={m(actualB.credito)} tooltip="Lo que se sumó a cuentas corrientes en el período (todavía no entró a la caja)." moneda={moneda} tono={actualB.credito > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos} />
            </div>
            <SeccionCard titulo="Evolución del dinero ingresado" subtitulo={comparar ? `Línea llena: ${etiquetaTramoActual}. Punteada: ${etiquetaTramoAnterior}.` : undefined}>
              {ocultarMontos ? graficoOculto : <LineAreaChart puntos={serieIngresado} moneda={moneda} compararActivo={comparar} />}
            </SeccionCard>
            <SeccionCard titulo="Caja por medio de pago" accion={<VistaToggle vista={vistaFormaPago} onVista={setVistaFormaPago} />}>
              {cajaPorMedio.length === 0 ? (
                <EmptyState titulo="Sin cobros en el período" texto="Cuando registres pagos, vas a ver acá cómo se reparten por medio." />
              ) : vistaFormaPago === 'barras' ? (
                <RankingBarras datos={cajaPorMedio} moneda={moneda} oculto={ocultarMontos} />
              ) : (
                <RankingTorta datos={cajaPorMedio} moneda={moneda} oculto={ocultarMontos} />
              )}
            </SeccionCard>
          </>
        );

      case 'cobrar':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Saldo por cobrar" valor={m(porCobrar)} tooltip="Lo que hoy te deben tus clientes en total (deuda actual, no del período). Tocá para ver el detalle." tono={vencidoTotal > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos} onClick={() => router.push('/cuentas-por-cobrar')} />
              <StatCard etiqueta="Vencido" valor={m(vencidoTotal)} tooltip="De lo que te deben, cuánto ya pasó su fecha de vencimiento. Tocá para ver el detalle." tono={vencidoTotal > 0 ? 'text-bad' : undefined} sensible oculto={ocultarMontos} onClick={() => router.push('/cuentas-por-cobrar')} />
              <StatCard etiqueta="Fiado en el período" valor={m(actualB.credito)} tooltip="Cuánto sumaste a cuentas corrientes en el período elegido." variacion={varSi(actualB.credito, prevB.credito)} positivoEsBueno={false} moneda={moneda} sensible oculto={ocultarMontos} />
            </div>
            <SeccionCard titulo="Cuentas por cobrar">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted dark:text-dark-text-secondary">
                  {ocultarMontos
                    ? 'Tocá "Mostrar montos" arriba para ver los saldos por cobrar.'
                    : vencidoTotal > 0
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

            {resumenFinanciacion.hayDatos && (
              <SeccionCard titulo="Financiación propia en cuotas" subtitulo="Ventas financiadas con cronograma propio — un crédito no es dinero cobrado hasta que se registra el pago.">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <StatCard etiqueta="Financiado activo" valor={m(resumenFinanciacion.totalFinanciadoActivo)} tooltip="Importe financiado de los planes activos o completados (a hoy, no depende del período)." moneda={moneda} sensible oculto={ocultarMontos} />
                  <StatCard etiqueta="Nuevos créditos" valor={m(resumenFinanciacion.nuevosCreditosPeriodo)} tooltip="Planes de financiación creados en el período elegido." moneda={moneda} sensible oculto={ocultarMontos} />
                  <StatCard etiqueta="Cobrado en cuotas" valor={m(resumenFinanciacion.cobradoPeriodo)} tooltip="Pagos de cuotas recibidos en el período (por fecha real de pago, no de vencimiento)." moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
                  <StatCard etiqueta="Saldo en cuotas" valor={m(resumenFinanciacion.saldoPendiente)} tooltip="Lo que falta cobrar de cuotas pendientes (a hoy)." moneda={moneda} sensible oculto={ocultarMontos} />
                  <StatCard etiqueta="Vencido en cuotas" valor={m(resumenFinanciacion.vencido)} tooltip="De las cuotas pendientes, cuánto ya pasó su vencimiento." tono={resumenFinanciacion.vencido > 0 ? 'text-bad' : undefined} moneda={moneda} sensible oculto={ocultarMontos}>
                    {!ocultarMontos && resumenFinanciacion.saldoPendiente > 0 && (
                      <span className="text-[11px] text-muted dark:text-dark-text-secondary">{Math.round(resumenFinanciacion.pctMorosidad)}% de morosidad</span>
                    )}
                  </StatCard>
                  <StatCard etiqueta="Próximas a vencer" valor={resumenFinanciacion.proximasAVencer.toLocaleString('es-AR')} tooltip="Cuotas pendientes que vencen dentro de los próximos 7 días." tono={resumenFinanciacion.proximasAVencer > 0 ? 'text-warn' : undefined} />
                </div>
              </SeccionCard>
            )}
          </>
        );

      case 'stock':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Equipos en stock" valor={stockResumen.unidades.toLocaleString('es-AR')} tooltip="Dispositivos disponibles para vender ahora mismo. Tocá para ver el detalle." onClick={() => router.push('/stock')} />
              <StatCard etiqueta="Capital en stock" valor={m(stockResumen.capitalPrecio)} tooltip="Suma de los precios de venta de todo el stock actual." moneda={moneda} sensible oculto={ocultarMontos} />
              {puedeVerCostos && <StatCard etiqueta="Capital a costo" valor={m(stockResumen.capitalCosto)} tooltip="Lo que te costó el stock que tenés (a precio de compra)." moneda={moneda} sensible oculto={ocultarMontos} />}
              <StatCard etiqueta="Parados +30 días" valor={stockResumen.quietos.toLocaleString('es-AR')} tooltip="Equipos que llevan más de 30 días sin venderse." tono={stockResumen.quietos > 0 ? 'text-warn' : undefined} />
              <StatCard etiqueta="Sin precio" valor={stockResumen.sinPrecio.toLocaleString('es-AR')} tooltip="Equipos cargados sin precio de venta (no se pueden vender así)." tono={stockResumen.sinPrecio > 0 ? 'text-warn' : undefined} />
            </div>
            <SeccionCard titulo="Stock por modelo" subtitulo="Foto del inventario de hoy (no depende del período).">
              {stockPorModelo.length === 0 ? <EmptyState titulo="Sin equipos en stock" /> : <RankingBarras datos={stockPorModelo} sufijo=" equipo(s)" />}
            </SeccionCard>
            {categoriasStock.length > 0 && (
              <SeccionCard titulo="Stock por categoría" subtitulo="Mismas categorías que Configuración → Categorías de stock.">
                <RankingBarras datos={stockPorCategoria} sufijo=" equipo(s)" />
              </SeccionCard>
            )}
            <SeccionCard
              titulo="Quién registró más equipos"
              subtitulo={`Altas de stock de ${etiquetaTramoActual}.`}
              accion={<VistaToggle vista={vistaRegistroStock} onVista={setVistaRegistroStock} />}
            >
              {rankingRegistroStock.length === 0 ? (
                <EmptyState titulo="Sin equipos registrados en el período" />
              ) : vistaRegistroStock === 'barras' ? (
                <RankingBarras datos={rankingRegistroStock} sufijo=" equipo(s)" />
              ) : (
                <RankingTorta datos={rankingRegistroStock} sufijo=" equipo(s)" />
              )}
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
            <SeccionCard titulo="¿Buscás más profundidad?" subtitulo="Facturación, márgenes, reincidencia, embudo de estados, stock crítico y más, filtrable por técnico y período.">
              <Link
                href="/servicio-tecnico/metricas"
                className="self-start rounded-xl bg-accent dark:bg-dark-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors inline-block"
              >
                Ver Métricas de Servicio Técnico →
              </Link>
            </SeccionCard>
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
                {rankingCompradores.length === 0 ? <EmptyState titulo="Sin compras en el período" /> : vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} />}
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
            {puedeVerCostos && resumenComisiones.hayDatos && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard etiqueta="Comisión generada" valor={m(resumenComisiones.generada)} tooltip="Comisión generada por ventas del período, para todos los vendedores." moneda={moneda} sensible oculto={ocultarMontos} />
                <StatCard etiqueta="Comisión pagada" valor={m(resumenComisiones.pagada)} tooltip="De la comisión generada en el período, cuánto ya se liquidó y pagó." moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
                <StatCard etiqueta="Comisión pendiente" valor={m(resumenComisiones.pendiente)} tooltip="Comisión generada en el período que todavía no se aprobó/liquidó/pagó." moneda={moneda} tono={resumenComisiones.pendiente > 0 ? 'text-warn' : undefined} sensible oculto={ocultarMontos} />
              </div>
            )}
            <SeccionCard titulo="Rendimiento por vendedor" subtitulo={`Ventas de ${etiquetaTramoActual}.`}>
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
            {resumenComisiones.hayDatos && (
              <SeccionCard titulo="¿Buscás el detalle por vendedor?" subtitulo="Comisión por vendedor, planes, liquidaciones y pagos.">
                <Link href="/comisiones" className="self-start rounded-xl bg-accent dark:bg-dark-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors inline-block">
                  Ver Comisiones →
                </Link>
              </SeccionCard>
            )}
          </>
        );

      case 'proveedores':
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard etiqueta="Comprado en el período" valor={m(comprasPeriodo.total)} tooltip="Total gastado en compras a proveedores (dispositivos + compras manuales) en el período. Esto es lo COMPRADO, no necesariamente lo pagado." moneda={moneda} sensible oculto={ocultarMontos} />
              <StatCard etiqueta="Unidades compradas" valor={comprasPeriodo.cantidad.toLocaleString('es-AR')} tooltip="Cantidad de equipos/ítems comprados a proveedores en el período." />
              <StatCard etiqueta="Proveedores activos" valor={rankingProveedores.length.toLocaleString('es-AR')} tooltip="Proveedores a los que les compraste en el período." />
              {saldoProveedoresTotal != null && (
                <>
                  <StatCard etiqueta="Pagado a proveedores" valor={m(pagadoProveedoresPeriodo)} tooltip="Plata que efectivamente les pagaste a proveedores en el período (cuentas por pagar)." moneda={moneda} tono="text-good" sensible oculto={ocultarMontos} />
                  <StatCard etiqueta="Saldo con proveedores" valor={m(saldoProveedoresTotal)} tooltip="Lo que hoy les debés a tus proveedores en total (deuda actual, no del período). Tocá para ver el detalle." tono={saldoProveedoresTotal > 0 ? 'text-warn' : undefined} moneda={moneda} sensible oculto={ocultarMontos} onClick={() => router.push('/proveedores')} />
                </>
              )}
            </div>
            <SeccionCard titulo="Compras por proveedor" accion={<VistaToggle vista={vistaProveedores} onVista={setVistaProveedores} />}>
              {rankingProveedores.length === 0 ? <EmptyState titulo="Sin compras en el período" texto="Cuando cargues compras a proveedores, vas a ver el detalle acá." /> : vistaProveedores === 'barras' ? <RankingBarras datos={rankingProveedores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingProveedores} moneda={moneda} oculto={ocultarMontos} />}
            </SeccionCard>
            {saldoProveedoresTotal != null && (
              <SeccionCard titulo="¿Buscás el detalle por proveedor?" subtitulo="Saldo, historial de pagos y comprobantes de cada proveedor.">
                <Link href="/proveedores" className="self-start rounded-xl bg-accent dark:bg-dark-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors inline-block">
                  Ver Proveedores →
                </Link>
              </SeccionCard>
            )}
            {puedeVerEgresos && (
              <SeccionCard titulo="¿Buscás egresos operativos?" subtitulo="Gasto operativo, retiros y ajustes — distinto de compras y pagos a proveedores.">
                <Link href="/egresos" className="self-start rounded-xl bg-accent dark:bg-dark-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors inline-block">
                  Ver Egresos →
                </Link>
              </SeccionCard>
            )}
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
              Rendimiento de {nombreNegocio || 'tu negocio'} · {etiquetaTramoActual}
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
            onClick={exportarResumen(
              actualB,
              ticket,
              porCobrar,
              vencidoTotal,
              periodo,
              rango,
              moneda,
              puedeVerCostos,
              nombreNegocio,
              resumenFinanciacion,
              saldoProveedoresTotal,
              pagadoProveedoresPeriodo,
              resumenComisiones,
              puedeVerEgresos,
              egresosPeriodo,
              hayEgresos,
              resultadoOperativoEstimado
            )}
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
                tooltip={`Ventas netas menos costo histórico de venta, en lo que tiene costo cargado (${Math.round(cobertura * 100)}% de las ventas del período). El resto no se puede calcular sin costo — nunca se usa el costo actual para recalcular ventas viejas.`}
                variacion={comparar ? variacion(actualB.ganancia, prevB.ganancia) : undefined}
                moneda={moneda}
                tono="text-good"
                sensible
                oculto={ocultarMontos}
              >
                {!ocultarMontos && actualB.ventasConCosto > 0 && (
                  <span className="text-[11px] text-muted dark:text-dark-text-secondary">
                    Margen {Math.round((actualB.ganancia / actualB.ventasConCosto) * 100)}% sobre lo que tiene costo
                  </span>
                )}
              </StatCard>
            )}
            {puedeVerEgresos && hayEgresos && (
              <StatCard
                etiqueta="Egresos operativos"
                valor={m(egresosPeriodo)}
                tooltip="Gasto operativo, retiro de dinero y ajustes registrados en el período (no incluye compras de mercadería ni pagos a proveedores, esos ya tienen su propio total)."
                moneda={moneda}
                tono="text-bad"
                sensible
                oculto={ocultarMontos}
                onClick={() => router.push('/egresos')}
              />
            )}
            {puedeVerCostos && puedeVerEgresos && hayEgresos && (
              <StatCard
                etiqueta="Resultado operativo estimado"
                valor={m(resultadoOperativoEstimado)}
                tooltip="Ganancia bruta menos egresos operativos del período. Es una ESTIMACIÓN: no incluye impuestos ni otras obligaciones contables, no lo confundas con una ganancia neta real."
                moneda={moneda}
                tono={resultadoOperativoEstimado >= 0 ? 'text-good' : 'text-bad'}
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
              tooltip="Lo que hoy te deben tus clientes en total (deuda actual, no del período). Tocá para ver el detalle."
              tono={vencidoTotal > 0 ? 'text-warn' : undefined}
              sensible
              oculto={ocultarMontos}
              onClick={() => router.push('/cuentas-por-cobrar')}
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
            subtitulo={comparar ? `Línea llena: ${etiquetaTramoActual}. Punteada: ${etiquetaTramoAnterior}.` : undefined}
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
              {vistaVendedores === 'barras' ? <RankingBarras datos={rankingVendedores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingVendedores} moneda={moneda} oculto={ocultarMontos} />}
            </SeccionCard>
            <SeccionCard titulo="Caja por medio de pago" accion={<VistaToggle vista={vistaFormaPago} onVista={setVistaFormaPago} />}>
              {vistaFormaPago === 'barras' ? <RankingBarras datos={cajaPorMedio} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={cajaPorMedio} moneda={moneda} oculto={ocultarMontos} />}
            </SeccionCard>
            <SeccionCard titulo="Ranking de técnicos" accion={<VistaToggle vista={vistaTecnicos} onVista={setVistaTecnicos} />}>
              {vistaTecnicos === 'barras' ? <RankingBarras datos={rankingTecnicos} sufijo=" arreglo(s)" /> : <RankingTorta datos={rankingTecnicos} sufijo=" arreglo(s)" />}
            </SeccionCard>
            <SeccionCard titulo="Mejores compradores" accion={<VistaToggle vista={vistaCompradores} onVista={setVistaCompradores} />}>
              {vistaCompradores === 'barras' ? <RankingBarras datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingCompradores} moneda={moneda} oculto={ocultarMontos} />}
            </SeccionCard>
            <SeccionCard titulo="Clientes de servicio técnico" accion={<VistaToggle vista={vistaClientesServicio} onVista={setVistaClientesServicio} />}>
              {vistaClientesServicio === 'barras' ? <RankingBarras datos={rankingClientesServicio} sufijo=" equipo(s)" /> : <RankingTorta datos={rankingClientesServicio} sufijo=" equipo(s)" />}
            </SeccionCard>
            {rankingProveedores.length > 0 && (
              <SeccionCard titulo="Compras a proveedores" accion={<VistaToggle vista={vistaProveedores} onVista={setVistaProveedores} />}>
                {vistaProveedores === 'barras' ? <RankingBarras datos={rankingProveedores} moneda={moneda} oculto={ocultarMontos} /> : <RankingTorta datos={rankingProveedores} moneda={moneda} oculto={ocultarMontos} />}
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
// Una fórmula que empiece con =/+/-/@ en un CSV puede ejecutarse sola al
// abrirlo en Excel/Sheets ("inyección de fórmulas") — acá los valores son
// todos numéricos o generados por el propio código (nunca texto libre de un
// cliente/producto), pero igual se antepone un apóstrofe por las dudas si
// alguna vez se agrega un campo de texto libre (nombre de negocio).
function celdaCSV(v: string): string {
  const esFormula = /^[=+\-@]/.test(v);
  return `"${(esFormula ? "'" : '') + v.replace(/"/g, '""')}"`;
}

function exportarResumen(
  b: { ventas: number; ganancia: number; ingresado: number; credito: number; operaciones: number },
  ticket: number,
  porCobrar: number,
  vencido: number,
  periodo: Periodo,
  rango: { inicio: Date; fin: Date },
  moneda: string,
  puedeVerCostos: boolean,
  nombreNegocio: string,
  resumenFinanciacion: { totalFinanciadoActivo: number; cobradoPeriodo: number; saldoPendiente: number; vencido: number; hayDatos: boolean },
  saldoProveedoresTotal: number | null,
  pagadoProveedoresPeriodo: number,
  resumenComisiones: { generada: number; pagada: number; pendiente: number; hayDatos: boolean },
  puedeVerEgresos: boolean,
  egresosPeriodo: number,
  hayEgresos: boolean,
  resultadoOperativoEstimado: number
) {
  return () => {
    const ahora = new Date();
    const filas: [string, string][] = [
      ['Negocio', nombreNegocio || 'Sin nombre'],
      ['Generado el', ahora.toLocaleString('es-AR')],
      ['Zona horaria', Intl.DateTimeFormat().resolvedOptions().timeZone],
      ['Moneda', moneda],
      ['Período', etiquetaTramo(periodo, rango)],
      ['Ventas netas', String(Math.round(b.ventas))],
      ...(puedeVerCostos ? ([['Ganancia bruta', String(Math.round(b.ganancia))]] as [string, string][]) : []),
      ['Dinero ingresado', String(Math.round(b.ingresado))],
      ['Crédito otorgado', String(Math.round(b.credito))],
      ['Saldo por cobrar', String(Math.round(porCobrar))],
      ['Saldo vencido', String(Math.round(vencido))],
      ['Operaciones', String(b.operaciones)],
      ['Ticket promedio', String(Math.round(ticket))],
      ...(resumenFinanciacion.hayDatos
        ? ([
            ['Financiación — financiado activo', String(Math.round(resumenFinanciacion.totalFinanciadoActivo))],
            ['Financiación — cobrado en el período', String(Math.round(resumenFinanciacion.cobradoPeriodo))],
            ['Financiación — saldo en cuotas', String(Math.round(resumenFinanciacion.saldoPendiente))],
            ['Financiación — vencido en cuotas', String(Math.round(resumenFinanciacion.vencido))],
          ] as [string, string][])
        : []),
      ...(saldoProveedoresTotal != null
        ? ([
            ['Proveedores — pagado en el período', String(Math.round(pagadoProveedoresPeriodo))],
            ['Proveedores — saldo pendiente', String(Math.round(saldoProveedoresTotal))],
          ] as [string, string][])
        : []),
      ...(puedeVerCostos && resumenComisiones.hayDatos
        ? ([
            ['Comisiones — generada en el período', String(Math.round(resumenComisiones.generada))],
            ['Comisiones — pagada en el período', String(Math.round(resumenComisiones.pagada))],
            ['Comisiones — pendiente', String(Math.round(resumenComisiones.pendiente))],
          ] as [string, string][])
        : []),
      ...(puedeVerEgresos && hayEgresos
        ? ([
            ['Egresos operativos del período', String(Math.round(egresosPeriodo))],
            ...(puedeVerCostos ? ([['Resultado operativo estimado', String(Math.round(resultadoOperativoEstimado))]] as [string, string][]) : []),
          ] as [string, string][])
        : []),
    ];
    const csv = `Métrica,Valor (${moneda})\n` + filas.map(([k, v]) => `${celdaCSV(k)},${celdaCSV(v)}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analitica-${periodo}-${aFechaInput(rango.inicio)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
}
