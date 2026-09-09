'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerTodasLasFilas } from '../lib/db';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { registrarAuditoria } from '../lib/auditoria';
import { generarOrdenDeReparacion } from '../lib/ordenesServicio';
import { registrarCobroFinanciamiento } from '../lib/financiacion/servicio';
import { MEDIOS_PAGO, medioLabel } from '../lib/cuentaCorriente';
import { simboloMoneda } from '../lib/monedas';
import { formatearMonto, sanitizarDecimal } from '../lib/numeros';
import { ICONOS } from '../Iconos';
import { QoviState } from '../QoviState';
import Modal from '../Modal';
import { useT, useIdioma } from '../lib/idioma';
import { localeDe } from '../lib/i18n/traducir';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';

type Orden = {
  id: string;
  numero_orden: string | null;
  forma_pago: string | null;
  total: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
  orden_items: { descripcion: string; tipo: string }[];
  sucursal_id?: string | null;
};

// Plan canje del dispositivo que el cliente entregó como parte de pago —
// vive en su propia tabla (no en orden_items), así que sin esto una orden
// solo se podía encontrar buscando el equipo que se LLEVÓ, nunca el que
// dejó a cambio.
type CanjeOrden = { orden_id: string | null; modelo: string | null; imei: string | null; color: string | null };

// Reparaciones que el técnico ya marcó "listo para entregar" y todavía no se
// cobraron: el vendedor genera la boleta desde acá. Traemos todos los campos
// (select *) porque son poquitas filas y el helper necesita el checklist para
// armar la nota de condición del equipo.
type ReparacionLista = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  imei: string | null;
  diagnostico: string | null;
  importe_total: number | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  cliente_id: string | null;
  orden_cobro_id: string | null;
  fecha_reparado: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
  sucursal_id?: string | null;
};

const ESTADOS = ['todas', 'pendiente', 'pagado', 'entregado'];

// Mismo criterio que el resto de la app: el estado nunca se comunica solo
// por color, siempre va con texto (acá, capitalize del propio valor).
const ESTADO_ORDEN_COLOR: Record<string, string> = {
  pendiente: 'bg-warn/15 text-warn',
  pagado: 'bg-good/15 text-good',
  entregado: 'bg-muted/15 text-muted dark:bg-dark-text-secondary/15 dark:text-dark-text-secondary',
};
const TIPOS: { id: 'todas' | 'ventas' | 'servicio' | 'financiamiento'; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'servicio', label: 'Servicio técnico' },
  { id: 'financiamiento', label: 'Financiamiento' },
];

// Pedido real de un cliente: poder ver y cobrar desde Órdenes los planes de
// financiación propia activos (antes solo se veían/cobraban entrando a la
// ficha puntual de cada cliente, así que un cobro mal hecho por una
// vendedora quedaba invisible). Un plan por venta financiada; un mismo
// cliente puede tener varios planes activos a la vez (ver
// financiacion_planes — sin unique en cliente_id).
type PlanFinanciamiento = {
  id: string;
  cliente_id: string;
  orden_id: string | null;
  moneda: string;
  importe_financiado: number;
  estado: string;
  clientes: { nombre: string; apellido: string | null } | null;
};
type CuotaFinanciamiento = {
  id: string;
  plan_id: string;
  fecha_vencimiento: string;
  importe_original: number;
  importe_pagado: number;
  estado: string;
};
// Resumen agrupado por cliente+moneda (no por plan): a la vendedora que
// entra a cobrar le importa "cuánto me debe este cliente en total", no
// tener que elegir entre varios planes activos del mismo cliente.
type ResumenFinanciamiento = {
  clienteId: string;
  clienteNombre: string;
  moneda: string;
  totalFinanciado: number;
  saldo: number;
  proximoVencimiento: string | null;
  enMora: boolean;
  cantidadPlanes: number;
  // Solo cuando hay un único plan activo: sin ambigüedad de a qué venta
  // enlazar la boleta del cobro (ver orden_original_id).
  ordenOriginalId: string | null;
};

// Mismo criterio que ya se usaba solo para la etiqueta de cada tarjeta:
// una orden es "de servicio técnico" si todos sus ítems son trabajos
// (nunca hay un dispositivo/producto vendido junto), típicamente porque
// viene de recibir un equipo a reparar o de cobrar un arreglo.
function esServicioTecnico(o: Orden) {
  return o.orden_items.length > 0 && o.orden_items.every((i) => i.tipo === 'trabajo');
}

// Un cobro de financiamiento/cta-corriente (ver registrarCobroFinanciamiento)
// arma su boleta con un único ítem tipo 'financiamiento' — se distingue de
// una venta común para que en la lista general se lea claramente como
// "cobro" y no se confunda con un producto/dispositivo vendido (pedido
// real de un cliente: poder auditar estos cobros desde Órdenes).
function esCobroFinanciamiento(o: Orden) {
  return o.orden_items.length > 0 && o.orden_items.every((i) => i.tipo === 'financiamiento');
}

export default function Ordenes() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);
  const puedeVender = tienePermiso(actor, 'vender');
  const sucursalActual = useSucursalActual();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [canjes, setCanjes] = useState<CanjeOrden[]>([]);
  const [reparacionesListas, setReparacionesListas] = useState<ReparacionLista[]>([]);
  const [reparacionesCanceladas, setReparacionesCanceladas] = useState<ReparacionLista[]>([]);
  const [generando, setGenerando] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'ventas' | 'servicio' | 'financiamiento'>('todas');
  const [busqueda, setBusqueda] = useState('');
  // Planes de financiación activos — se cargan recién cuando se entra a
  // esta pestaña por primera vez (no en cada visita a Órdenes, que es la
  // pantalla que más se abre) y quedan en caché el resto de la sesión.
  const [planesFinanciamiento, setPlanesFinanciamiento] = useState<PlanFinanciamiento[]>([]);
  const [cuotasFinanciamiento, setCuotasFinanciamiento] = useState<CuotaFinanciamiento[]>([]);
  const [cargandoFinanciamiento, setCargandoFinanciamiento] = useState(false);
  const [financiamientoCargado, setFinanciamientoCargado] = useState(false);
  const [cobrando, setCobrando] = useState<ResumenFinanciamiento | null>(null);
  const [cobroMonto, setCobroMonto] = useState('');
  const [cobroMedio, setCobroMedio] = useState('efectivo');
  const [cobroObs, setCobroObs] = useState('');
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  // Por defecto se trae solo lo reciente (últimos 90 días) — con miles de
  // órdenes acumuladas, traer TODO el historial en cada visita a esta
  // pantalla (la que más se abre) es lo que hace sentir lento el sistema.
  // "Ver todo el historial" hace una segunda carga sin el filtro de fecha,
  // así una búsqueda por un cliente/equipo viejo sigue siendo posible, solo
  // que no es lo que se trae por defecto.
  const [historialCompleto, setHistorialCompleto] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  // Arranca en la sucursal elegida en el panel — si el dueño la cambia acá
  // adentro puede "espiar" otra sin tocar la selección global.
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  // useState solo toma el valor inicial una vez — si el dueño cambia de
  // sucursal en el panel MIENTRAS ya está en esta pantalla, hay que
  // seguirlo (si no, el filtro local queda pegado a la sucursal vieja hasta
  // que se navegue afuera y de vuelta).
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);

  const DIAS_VENTANA_RECIENTE = 90;

  const cargar = async (traerTodoElHistorial = false) => {
    const desdeReciente = new Date();
    desdeReciente.setDate(desdeReciente.getDate() - DIAS_VENTANA_RECIENTE);
    const [ordenesData, { data: listasData }, { data: canceladasData }, canjesData] = await Promise.all([
      obtenerTodasLasFilas<Orden>(
        supabase,
        'ordenes',
        'id, numero_orden, forma_pago, total, estado, created_at, sucursal_id, clientes ( nombre, apellido ), orden_items ( descripcion, tipo )',
        [{ columna: 'created_at', ascending: false }],
        traerTodoElHistorial ? undefined : (q) => q.gte('created_at', desdeReciente.toISOString())
      ),
      // Reparaciones terminadas por el técnico (con cliente) que faltan cobrar.
      supabase
        .from('reparaciones')
        .select('*, clientes ( nombre, apellido )')
        .eq('estado', 'listo_para_entregar')
        .not('cliente_id', 'is', null)
        .order('fecha_reparado', { ascending: true }),
      // Reparaciones de cliente canceladas/sin solución a las que todavía no
      // se les generó boleta (ej. para cobrar el diagnóstico, o solo dejar
      // constancia con $0) — dejan de aparecer acá apenas tienen boleta.
      supabase
        .from('reparaciones')
        .select('*, clientes ( nombre, apellido )')
        .eq('estado', 'cancelado')
        .not('cliente_id', 'is', null)
        .is('orden_cobro_id', null)
        .order('estado_actualizado_at', { ascending: false }),
      // Plan canje de cada orden, para poder buscar por el equipo que el
      // cliente entregó (no solo por el que se llevó).
      obtenerTodasLasFilas<CanjeOrden>(supabase, 'canjes', 'orden_id, modelo, imei, color', [], (q) => q.not('orden_id', 'is', null)),
    ]);
    setOrdenes(ordenesData);
    setReparacionesListas((listasData as any) ?? []);
    setReparacionesCanceladas((canceladasData as any) ?? []);
    setCanjes((canjesData as CanjeOrden[]) ?? []);
    if (traerTodoElHistorial) setHistorialCompleto(true);
    setLoading(false);
  };

  const verHistorialCompleto = async () => {
    if (historialCompleto || cargandoHistorial) return;
    setCargandoHistorial(true);
    await cargar(true);
    setCargandoHistorial(false);
  };

  const cargarFinanciamiento = async () => {
    setCargandoFinanciamiento(true);
    const { data: planesData } = await supabase
      .from('financiacion_planes')
      .select('id, cliente_id, orden_id, moneda, importe_financiado, estado, clientes ( nombre, apellido )')
      .eq('estado', 'activo');
    const planes = (planesData as any as PlanFinanciamiento[]) ?? [];
    setPlanesFinanciamiento(planes);
    if (planes.length > 0) {
      // Se traen TODAS las cuotas (no solo las pendientes): una cuota
      // parcialmente pagada sigue en estado 'pendiente' con importe_pagado
      // > 0, así que hace falta ver todas para sumar bien lo ya cobrado
      // (mismo criterio que el resumen de FinanciacionCliente en la ficha).
      const { data: cuotasData } = await supabase
        .from('financiacion_cuotas')
        .select('id, plan_id, fecha_vencimiento, importe_original, importe_pagado, estado')
        .in(
          'plan_id',
          planes.map((p) => p.id)
        );
      setCuotasFinanciamiento((cuotasData as CuotaFinanciamiento[]) ?? []);
    } else {
      setCuotasFinanciamiento([]);
    }
    setCargandoFinanciamiento(false);
    setFinanciamientoCargado(true);
  };

  useEffect(() => {
    if (filtroTipo === 'financiamiento' && !financiamientoCargado && !cargandoFinanciamiento) {
      cargarFinanciamiento();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo]);

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generarBoleta = async (r: ReparacionLista) => {
    if (!puedeVender || generando) return;
    if (!confirm(`${t('¿Generar la boleta de')} ${r.modelo || t('este equipo')}? ${t('Se cobra el importe de la reparación.')}`)) return;
    setGenerando(r.id);
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any, { sucursalId: sucursalActual.id });
    if (error || !ordenId) {
      alert(error || t('No pudimos generar la boleta.'));
      setGenerando(null);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `generó la boleta de una reparación lista (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorNuevo: { orden_id: ordenId, total },
    });
    router.push(`/ordenes/${ordenId}`);
  };

  const generarBoletaCancelada = async (r: ReparacionLista) => {
    if (!puedeVender || generando) return;
    if (
      !confirm(
        `${t('¿Generar la boleta de')} ${r.modelo || t('este equipo')}? ${t('La reparación queda como cancelada/sin solución — esto es solo para cobrar el diagnóstico o dejar constancia, no cambia ese estado.')}`
      )
    )
      return;
    setGenerando(r.id);
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any, { marcarEntregado: false, sucursalId: sucursalActual.id });
    if (error || !ordenId) {
      alert(error || t('No pudimos generar la boleta.'));
      setGenerando(null);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `generó la boleta de una reparación cancelada/sin solución (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorNuevo: { orden_id: ordenId, total },
    });
    router.push(`/ordenes/${ordenId}`);
  };

  const canjesPorOrden = useMemo(() => {
    const mapa = new Map<string, CanjeOrden[]>();
    for (const c of canjes) {
      if (!c.orden_id) continue;
      const arr = mapa.get(c.orden_id) ?? [];
      arr.push(c);
      mapa.set(c.orden_id, arr);
    }
    return mapa;
  }, [canjes]);

  // Agrupado por cliente+moneda (no por plan): a quien va a cobrar le
  // importa "cuánto me debe este cliente en total", no elegir entre varios
  // planes activos del mismo cliente. Mismo cálculo de saldo que el
  // resumen de FinanciacionCliente en la ficha (Σ importe_pagado de cuotas
  // no anuladas, restado del importe financiado).
  const resumenFinanciamiento = useMemo(() => {
    const hoyISO = new Date().toISOString().slice(0, 10);
    const cuotasPorPlan = new Map<string, CuotaFinanciamiento[]>();
    for (const c of cuotasFinanciamiento) {
      cuotasPorPlan.set(c.plan_id, [...(cuotasPorPlan.get(c.plan_id) ?? []), c]);
    }
    const porClienteYMoneda = new Map<string, ResumenFinanciamiento>();
    for (const p of planesFinanciamiento) {
      const cuotas = (cuotasPorPlan.get(p.id) ?? []).filter((c) => c.estado !== 'anulada');
      const pagado = cuotas.reduce((acc, c) => acc + c.importe_pagado, 0);
      const saldoPlan = Math.max(0, p.importe_financiado - pagado);
      const pendientes = cuotas.filter((c) => c.estado === 'pendiente').sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
      const proximoPlan = pendientes[0]?.fecha_vencimiento ?? null;
      const clienteNombre = p.clientes ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim() : t('Cliente');
      const clave = `${p.cliente_id}::${p.moneda}`;
      const existente = porClienteYMoneda.get(clave);
      if (existente) {
        existente.totalFinanciado += p.importe_financiado;
        existente.saldo += saldoPlan;
        existente.cantidadPlanes += 1;
        existente.ordenOriginalId = null; // más de un plan activo: no hay una venta puntual a la que enlazar
        if (proximoPlan && (!existente.proximoVencimiento || proximoPlan < existente.proximoVencimiento)) {
          existente.proximoVencimiento = proximoPlan;
        }
        if (proximoPlan && proximoPlan < hoyISO) existente.enMora = true;
      } else {
        porClienteYMoneda.set(clave, {
          clienteId: p.cliente_id,
          clienteNombre,
          moneda: p.moneda,
          totalFinanciado: p.importe_financiado,
          saldo: saldoPlan,
          proximoVencimiento: proximoPlan,
          enMora: !!proximoPlan && proximoPlan < hoyISO,
          cantidadPlanes: 1,
          ordenOriginalId: p.orden_id,
        });
      }
    }
    return Array.from(porClienteYMoneda.values())
      .filter((r) => r.saldo > 0.009)
      .sort((a, b) => (a.proximoVencimiento ?? '9999-99-99').localeCompare(b.proximoVencimiento ?? '9999-99-99'));
  }, [planesFinanciamiento, cuotasFinanciamiento, t]);

  const abrirCobro = (r: ResumenFinanciamiento) => {
    setCobrando(r);
    setCobroMonto(String(r.saldo));
    setCobroMedio('efectivo');
    setCobroObs('');
    setErrorCobro(null);
  };

  const confirmarCobro = async () => {
    if (!cobrando) return;
    const monto = Number(cobroMonto);
    if (!monto || monto <= 0) {
      setErrorCobro(t('Poné un monto mayor a cero.'));
      return;
    }
    setGuardandoCobro(true);
    setErrorCobro(null);
    const resultado = await registrarCobroFinanciamiento(supabase, {
      clienteId: cobrando.clienteId,
      monto,
      medio: cobroMedio,
      moneda: cobrando.moneda,
      sucursalId: sucursalActual.id,
      observacion: cobroObs,
      ordenOriginalId: cobrando.ordenOriginalId,
    });
    if ('error' in resultado) {
      setErrorCobro(resultado.error);
      setGuardandoCobro(false);
      return;
    }
    setGuardandoCobro(false);
    setCobrando(null);
    setFinanciamientoCargado(false);
    await cargarFinanciamiento();
    router.push(`/ordenes/${resultado.ordenId}/boleta`);
  };

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenes
      .filter((o) => filtroEstado === 'todas' || o.estado === filtroEstado)
      .filter((o) => !filtroSucursal || o.sucursal_id === filtroSucursal)
      .filter((o) => {
        if (filtroTipo === 'todas') return true;
        if (filtroTipo === 'financiamiento') return false;
        return filtroTipo === 'servicio' ? esServicioTecnico(o) : !esServicioTecnico(o);
      })
      .filter((o) => {
        if (!q) return true;
        const nombreCliente = o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}`.trim().toLowerCase() : '';
        // Modelo/IMEI ya viven adentro de la descripción del ítem (ej. "iPhone
        // 15 128GB Verde · IMEI 359..."), así que buscar en la descripción
        // también busca por esos datos sin tener que parsearlos aparte.
        const itemsTexto = o.orden_items.map((i) => i.descripcion.toLowerCase()).join(' ');
        // El dispositivo que el cliente ENTREGÓ como plan canje vive aparte
        // (tabla canjes), no en orden_items — sin esto, una orden con canje
        // solo se podía encontrar buscando el equipo que se llevó, nunca el
        // que dejó a cambio.
        const canjesTexto = (canjesPorOrden.get(o.id) ?? [])
          .map((c) => [c.modelo, c.imei, c.color].filter(Boolean).join(' '))
          .join(' ')
          .toLowerCase();
        return nombreCliente.includes(q) || itemsTexto.includes(q) || canjesTexto.includes(q);
      });
  }, [ordenes, filtroEstado, filtroSucursal, filtroTipo, busqueda, canjesPorOrden]);

  // Con "ver todo el historial" activado (años de órdenes), pintar TODAS las
  // tarjetas de una es lo que hace sentir lenta la pantalla que todo vendedor
  // usa todo el día — mismo patrón de paginado manual que Clientes/Stock. La
  // búsqueda/filtros siguen actuando sobre TODAS las órdenes cargadas
  // (filtradas no cambia), solo lo que se renderiza arranca corto.
  const PASO_VISIBLES = 150;
  const [visibles, setVisibles] = useState(PASO_VISIBLES);
  useEffect(() => {
    setVisibles(PASO_VISIBLES);
  }, [busqueda, filtroEstado, filtroTipo, filtroSucursal]);
  const paraRenderizar = useMemo(() => filtradas.slice(0, visibles), [filtradas, visibles]);

  // Se me había pasado esto en la primera pasada de multisucursal: estas dos
  // NO nacen de la tabla `ordenes` (que sí ya filtraba), sino de
  // `reparaciones` directo — sin este filtro, cambiar de sucursal seguía
  // mostrando acá reparaciones "listas para cobrar" de OTRA sucursal.
  const reparacionesListasFiltradas = useMemo(
    () => reparacionesListas.filter((r) => !filtroSucursal || r.sucursal_id === filtroSucursal),
    [reparacionesListas, filtroSucursal]
  );
  const reparacionesCanceladasFiltradas = useMemo(
    () => reparacionesCanceladas.filter((r) => !filtroSucursal || r.sucursal_id === filtroSucursal),
    [reparacionesCanceladas, filtroSucursal]
  );

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Órdenes')}</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('Buscar por cliente, modelo, IMEI o plan canje...')}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      {!historialCompleto && (
        <button
          onClick={verHistorialCompleto}
          disabled={cargandoHistorial}
          className="self-start text-xs text-accent dark:text-dark-accent underline disabled:opacity-50"
        >
          {cargandoHistorial
            ? t('Cargando todo el historial…')
            : `${t('Mostrando los últimos')} ${DIAS_VENTANA_RECIENTE} ${t('días —')} ${t('ver todo el historial')}`}
        </button>
      )}

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {TIPOS.map((tipo) => (
          <button
            key={tipo.id}
            onClick={() => setFiltroTipo(tipo.id)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
              filtroTipo === tipo.id ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t(tipo.label)}
          </button>
        ))}
      </div>

      {filtroTipo !== 'financiamiento' && (
        <div className="flex items-center gap-2 text-xs overflow-x-auto">
          {ESTADOS.map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              className={`shrink-0 rounded-xl px-3 py-2 font-medium capitalize ${
                filtroEstado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {t(e)}
            </button>
          ))}
        </div>
      )}

      {filtroTipo !== 'financiamiento' && sucursales.length > 1 && (
        <select
          value={filtroSucursal}
          onChange={(e) => setFiltroSucursal(e.target.value)}
          aria-label={t('Filtrar por sucursal')}
          className="self-start bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">🏬 {t('Todas las sucursales')}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              🏬 {s.nombre}
            </option>
          ))}
        </select>
      )}

      {filtroTipo !== 'financiamiento' &&
        (puedeVender ? (
          <Link
            href="/ordenes/nueva"
            className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
          >
            + {t('Nueva orden')}
          </Link>
        ) : (
          <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
            {t('No tenés permiso para crear órdenes.')}
          </p>
        ))}

      {filtroTipo !== 'financiamiento' && puedeVender && reparacionesListasFiltradas.length > 0 && (
        <section className="rounded-2xl border border-good/40 bg-good/5 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-good">
            🔧 {t('Reparados por el técnico · listos para cobrar')} ({reparacionesListasFiltradas.length})
          </p>
          {reparacionesListasFiltradas.map((r) => {
            const importe = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.modelo || t('Equipo')}
                    {r.numero_orden && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {r.numero_orden}</span>}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : t('Sin cliente')}
                    {importe > 0 && ` · $${importe.toLocaleString('es-AR')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/servicio-tecnico/${r.id}`}
                    className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap"
                  >
                    {t('Ver ficha')}
                  </Link>
                  <button
                    disabled={generando === r.id}
                    onClick={() => generarBoleta(r)}
                    className="rounded-lg bg-good hover:opacity-90 transition-opacity px-3 py-2 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    {generando === r.id ? t('Generando…') : t('Generar boleta')}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {filtroTipo !== 'financiamiento' && puedeVender && reparacionesCanceladasFiltradas.length > 0 && (
        <section className="rounded-2xl border border-bad/40 bg-bad/5 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-bad">
            🔴 {t('Cancelados sin solución')} ({reparacionesCanceladasFiltradas.length})
          </p>
          {reparacionesCanceladasFiltradas.map((r) => {
            const importe = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.modelo || t('Equipo')}
                    {r.numero_orden && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {r.numero_orden}</span>}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : t('Sin cliente')}
                    {importe > 0 && ` · $${importe.toLocaleString('es-AR')}`}
                    {r.diagnostico && ` · ${r.diagnostico}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/servicio-tecnico/${r.id}`}
                    className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap"
                  >
                    {t('Ver ficha')}
                  </Link>
                  <button
                    disabled={generando === r.id}
                    onClick={() => generarBoletaCancelada(r)}
                    className="rounded-lg bg-bad hover:opacity-90 transition-opacity px-3 py-2 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    {generando === r.id ? t('Generando…') : t('Generar boleta')}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {filtroTipo === 'financiamiento' ? (
        <>
          {cargandoFinanciamiento && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
          )}
          {!cargandoFinanciamiento && resumenFinanciamiento.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {t('No hay clientes con financiamiento activo.')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {resumenFinanciamiento.map((r) => (
              <div
                key={`${r.clienteId}::${r.moneda}`}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.clienteNombre}</p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {t('Saldo')}: {simboloMoneda(r.moneda)}
                    {formatearMonto(r.saldo)}
                    {r.cantidadPlanes > 1 && ` · ${r.cantidadPlanes} ${t('planes')}`}
                  </p>
                  {r.proximoVencimiento && (
                    <p className={`text-xs mt-0.5 ${r.enMora ? 'text-bad font-medium' : 'text-muted dark:text-dark-text-secondary'}`}>
                      {r.enMora ? t('Vencida desde') : t('Próximo vencimiento')}:{' '}
                      {new Date(r.proximoVencimiento + 'T00:00:00').toLocaleDateString(locale)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/clientes/${r.clienteId}`} className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap">
                    {t('Ver ficha')}
                  </Link>
                  {puedeVender && (
                    <button
                      onClick={() => abrirCobro(r)}
                      className="rounded-lg bg-good hover:opacity-90 transition-opacity px-3 py-2 text-xs font-medium text-white whitespace-nowrap"
                    >
                      {t('Cobrar')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}

          {!loading && filtradas.length === 0 && (busqueda.trim() !== '' || filtroEstado !== 'todas' || filtroTipo !== 'todas') && (
            <QoviState
              escena="sinResultados"
              tamano="sm"
              titulo={t('No encontramos resultados')}
              descripcion={
                !historialCompleto && busqueda.trim() !== ''
                  ? t('Nada coincide en los últimos 90 días — puede estar más atrás en el historial.')
                  : t('Nada coincide con esa búsqueda o esos filtros.')
              }
              accionPrimaria={
                !historialCompleto && busqueda.trim() !== ''
                  ? { label: cargandoHistorial ? t('Cargando…') : t('Buscar en todo el historial'), onClick: verHistorialCompleto }
                  : undefined
              }
              accionSecundaria={{
                label: t('Limpiar filtros'),
                onClick: () => {
                  setBusqueda('');
                  setFiltroEstado('todas');
                  setFiltroTipo('todas');
                },
              }}
            />
          )}
          {!loading && filtradas.length === 0 && busqueda.trim() === '' && filtroEstado === 'todas' && filtroTipo === 'todas' && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('No hay órdenes para mostrar.')}</p>
          )}

          <div className="flex flex-col gap-2">
            {paraRenderizar.map((o) => {
              const servicio = esServicioTecnico(o);
              const cobroFinanciamiento = !servicio && esCobroFinanciamiento(o);
              const colorTipo = servicio ? 'text-repar' : cobroFinanciamiento ? 'text-good' : 'text-accent dark:text-dark-accent';
              const icono = servicio ? 'herramienta' : cobroFinanciamiento ? 'cobrar' : 'ordenes';
              const etiquetaTipo = servicio ? t('Servicio técnico') : cobroFinanciamiento ? t('Cobro financiamiento') : t('Venta');
              const estadoInfo = ESTADO_ORDEN_COLOR[o.estado] ?? ESTADO_ORDEN_COLOR.pendiente;
              return (
                <Link
                  key={o.id}
                  href={`/ordenes/${o.id}`}
                  className="relative overflow-hidden rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card pl-4 pr-4 py-3 flex items-center justify-between gap-3"
                >
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-1 ${servicio ? 'bg-repar' : cobroFinanciamiento ? 'bg-good' : 'bg-accent dark:bg-dark-accent'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span aria-hidden="true" className={`shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 ${colorTipo}`}>
                        {ICONOS[icono]}
                      </span>
                      <span className="truncate">
                        {o.orden_items.length > 0
                          ? `${o.orden_items[0].descripcion}${o.orden_items.length > 1 ? ` +${o.orden_items.length - 1}` : ''}`
                          : t('Orden vacía')}
                      </span>
                    </p>
                    <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                      <span className={`font-medium ${colorTipo}`}>{etiquetaTipo}</span>
                      {' · '}
                      {o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}` : t('Sin cliente')}
                      {o.numero_orden && <span className="text-muted dark:text-dark-text-secondary"> · {o.numero_orden}</span>}
                    </p>
                    {(canjesPorOrden.get(o.id) ?? []).length > 0 && (
                      <p className="text-[11px] text-accent dark:text-dark-accent mt-0.5 truncate">
                        {t('Canje:')} {(canjesPorOrden.get(o.id) ?? []).map((c) => c.modelo || t('equipo')).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize mt-0.5 ${estadoInfo}`}>
                      {t(o.estado)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {visibles < filtradas.length && (
            <button
              onClick={() => setVisibles((v) => v + PASO_VISIBLES)}
              className="w-full rounded-xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
            >
              {t('Mostrar')} {Math.min(PASO_VISIBLES, filtradas.length - visibles)} {t('más')}
            </button>
          )}
        </>
      )}

      {cobrando && (
        <Modal titulo={`${t('Cobrar a')} ${cobrando.clienteNombre}`} onClose={() => (guardandoCobro ? null : setCobrando(null))}>
          {errorCobro && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{errorCobro}</p>}
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {t('Saldo total')}: {simboloMoneda(cobrando.moneda)}
            {formatearMonto(cobrando.saldo)}
          </p>
          <label className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Monto a cobrar')}</label>
          <input
            value={cobroMonto}
            onChange={(e) => setCobroMonto(sanitizarDecimal(e.target.value))}
            inputMode="decimal"
            autoFocus
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <label className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Medio de pago')}</label>
          <select
            value={cobroMedio}
            onChange={(e) => setCobroMedio(e.target.value)}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          >
            {MEDIOS_PAGO.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.icono} {t(medioLabel(m.codigo))}
              </option>
            ))}
          </select>
          <input
            value={cobroObs}
            onChange={(e) => setCobroObs(e.target.value)}
            placeholder={t('Observación (opcional)')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setCobrando(null)}
              disabled={guardandoCobro}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {t('Cancelar')}
            </button>
            <button
              onClick={confirmarCobro}
              disabled={guardandoCobro}
              className="flex-1 rounded-xl bg-good hover:opacity-90 transition-opacity py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardandoCobro ? t('Guardando...') : t('Cobrar y generar boleta')}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
