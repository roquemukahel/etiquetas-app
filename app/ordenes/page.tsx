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
import { MEDIOS_PAGO, medioLabel, calcularSaldo, diasDeMora } from '../lib/cuentaCorriente';
import type { CuentaCorrienteServicioTecnico } from '../lib/ordenesServicio';
import { simboloMoneda } from '../lib/monedas';
import { formatearMonto, sanitizarDecimal } from '../lib/numeros';
import { formatearFechaHora } from '../lib/fechas';
import { descargarXLSX } from '../lib/csv';
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
  forma_pago: string | null;
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

// Pedido real de un cliente: poder ver y cobrar desde Órdenes a CUALQUIER
// cliente que le deba plata — no solo a los que tienen un plan de
// financiación en cuotas formal. Muchos negocios solo "fían" a cuenta
// corriente simple (Nueva Orden con "Cuenta corriente" como forma de pago,
// sin activar "financiar en cuotas"), que nunca crea fila en
// financiacion_planes — antes esos clientes no aparecían acá aunque sí le
// debieran plata de verdad. El saldo real siempre sale de
// saldos_cuenta_corriente() (el libro mayor, Σcargos−Σabonos — mismo RPC
// que ya usa Cuentas por cobrar); financiacion_planes/cuotas solo aporta
// información complementaria (próximo vencimiento, a qué venta enlazar el
// cobro) cuando existe un plan formal.
type PlanFinanciamiento = {
  id: string;
  cliente_id: string;
  orden_id: string | null;
  moneda: string;
  estado: string;
};
type CuotaFinanciamiento = {
  id: string;
  plan_id: string;
  numero: number;
  fecha_vencimiento: string;
  importe_original: number;
  importe_pagado: number;
  estado: string;
};
type SaldoCtaCte = { clienteId: string; saldo: number; vencido: number };

// Una fila por cada cargo/abono real (ver cuenta_corriente_supabase.sql) —
// esto es lo que la vista "Movimientos" muestra agrupado por día, a
// diferencia de resumenFinanciamiento (que resume por cliente, no por
// evento). pagos/financiacion_cuotas se traen embebidos vía pago_id/cuota_id.
type MovimientoFinanciamiento = {
  id: string;
  fecha: string;
  cliente_id: string;
  tipo: string;
  concepto: string;
  monto: number;
  moneda: string;
  anulado: boolean;
  observacion: string | null;
  registrado_por_nombre: string | null;
  sucursal_id: string | null;
  orden_id: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
  financiacion_cuotas: { numero: number } | null;
  pagos: { medio: string } | null;
};
// Resumen por cliente (uno solo, aunque tenga varios planes activos): a la
// vendedora que entra a cobrar le importa "cuánto me debe este cliente en
// total", no elegir entre planes.
type ResumenFinanciamiento = {
  clienteId: string;
  clienteNombre: string;
  moneda: string;
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
  const [saldosCtaCte, setSaldosCtaCte] = useState<SaldoCtaCte[]>([]);
  const [nombresClientesFinanciamiento, setNombresClientesFinanciamiento] = useState<Map<string, string>>(new Map());
  // Moneda de respaldo para un cliente con fiado simple (sin ningún plan de
  // cuotas propio que indique en qué moneda es su saldo) — la del negocio.
  const [monedaNegocio, setMonedaNegocio] = useState('ARS');
  const [cargandoFinanciamiento, setCargandoFinanciamiento] = useState(false);
  const [financiamientoCargado, setFinanciamientoCargado] = useState(false);
  // Pedido real de un cliente: por defecto la pestaña Financiamiento mostraba
  // primero una tarjeta por cliente con saldo (~12 pantallas de scroll antes
  // de llegar a ver un solo pago) — "Movimientos" (día por día, con total)
  // pasa a ser la vista por defecto; "Cartera" es la lista de clientes de
  // siempre, para cuando lo que hace falta es ver a quién le falta cobrar.
  const [vistaFinanciamiento, setVistaFinanciamiento] = useState<'movimientos' | 'cartera'>('movimientos');
  // Datos que la vista "Cartera" pide además del saldo: último pago (fecha +
  // sucursal donde se hizo) y la fecha del cargo vencido más antiguo (para
  // "días de atraso") — mismo criterio que ya usa la ficha del cliente
  // (cargosVencidos/vencMasAntiguo), calculado acá por cliente.
  const [carteraExtra, setCarteraExtra] = useState<Map<string, { ultimoPago: string | null; sucursalUltimoPago: string | null; vencMasAntiguo: string | null }>>(new Map());
  const [movimientosFinanciamiento, setMovimientosFinanciamiento] = useState<MovimientoFinanciamiento[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [movimientosCargados, setMovimientosCargados] = useState(false);
  const [movHistorialCompleto, setMovHistorialCompleto] = useState(false);
  const [filtroMovFecha, setFiltroMovFecha] = useState<'hoy' | 'ayer' | 'semana' | 'mes' | 'todo'>('mes');
  const [filtroMovSucursal, setFiltroMovSucursal] = useState('');
  const [filtroMovCajero, setFiltroMovCajero] = useState('');
  const [filtroMovForma, setFiltroMovForma] = useState('');
  const [exportandoMovimientos, setExportandoMovimientos] = useState(false);
  const [cobrando, setCobrando] = useState<ResumenFinanciamiento | null>(null);
  const [cobroMonto, setCobroMonto] = useState('');
  const [cobroMedio, setCobroMedio] = useState('efectivo');
  const [cobroObs, setCobroObs] = useState('');
  // A qué se aplica el pago: 'cuenta_corriente' (fiado sin cuota puntual) o
  // el id de una cuota de financiación puntual — pedido real de un cliente
  // que tiene las dos cosas a la vez y necesitaba elegir bien cuál está
  // pagando, en vez de que el sistema reparta solo (ver
  // registrarCobroFinanciamiento/omitirFinanciacion).
  const [cobroDestino, setCobroDestino] = useState<string>('');
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
    // saldos_cuenta_corriente(): el libro mayor real (Σcargos−Σabonos), trae
    // a CUALQUIER cliente con saldo — con o sin plan de cuotas formal. Mismo
    // RPC que ya usa /cuentas-por-cobrar para esto mismo.
    const [{ data: saldosData }, { data: planesData }] = await Promise.all([
      supabase.rpc('saldos_cuenta_corriente'),
      supabase.from('financiacion_planes').select('id, cliente_id, orden_id, moneda, estado').eq('estado', 'activo'),
    ]);
    const saldos = (((saldosData ?? []) as { cliente_id: string; saldo: number; vencido: number }[])
      .map((s) => ({ clienteId: s.cliente_id, saldo: Number(s.saldo) || 0, vencido: Number(s.vencido) || 0 }))
      .filter((s) => s.saldo > 0.009));
    setSaldosCtaCte(saldos);

    const planes = (planesData as PlanFinanciamiento[]) ?? [];
    setPlanesFinanciamiento(planes);

    const idsClientes = Array.from(new Set(saldos.map((s) => s.clienteId)));
    if (idsClientes.length > 0) {
      const [{ data: clientesData }, { data: movsData }] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido').in('id', idsClientes),
        supabase
          .from('cta_cte_movimientos')
          .select('cliente_id, tipo, concepto, monto, vencimiento, fecha, sucursal_id')
          .in('cliente_id', idsClientes)
          .eq('anulado', false),
      ]);
      setNombresClientesFinanciamiento(
        new Map(((clientesData ?? []) as { id: string; nombre: string; apellido: string | null }[]).map((c) => [c.id, `${c.nombre} ${c.apellido || ''}`.trim()]))
      );

      const hoyISO = new Date().toISOString().slice(0, 10);
      const extra = new Map<string, { ultimoPago: string | null; sucursalUltimoPago: string | null; vencMasAntiguo: string | null }>();
      for (const m of (movsData as { cliente_id: string; tipo: string; concepto: string; monto: number; vencimiento: string | null; fecha: string; sucursal_id: string | null }[]) ?? []) {
        const info = extra.get(m.cliente_id) ?? { ultimoPago: null, sucursalUltimoPago: null, vencMasAntiguo: null };
        if (m.tipo === 'abono' && m.concepto === 'pago' && (!info.ultimoPago || m.fecha > info.ultimoPago)) {
          info.ultimoPago = m.fecha;
          info.sucursalUltimoPago = m.sucursal_id;
        }
        if (m.tipo === 'cargo' && m.vencimiento && m.vencimiento < hoyISO && (!info.vencMasAntiguo || m.vencimiento < info.vencMasAntiguo)) {
          info.vencMasAntiguo = m.vencimiento;
        }
        extra.set(m.cliente_id, info);
      }
      setCarteraExtra(extra);
    } else {
      setNombresClientesFinanciamiento(new Map());
      setCarteraExtra(new Map());
    }

    if (planes.length > 0) {
      // Se traen TODAS las cuotas (no solo las pendientes): una cuota
      // parcialmente pagada sigue en estado 'pendiente' con importe_pagado
      // > 0, así que hace falta ver todas para sumar bien lo ya cobrado
      // (mismo criterio que el resumen de FinanciacionCliente en la ficha).
      const { data: cuotasData } = await supabase
        .from('financiacion_cuotas')
        .select('id, plan_id, numero, fecha_vencimiento, importe_original, importe_pagado, estado')
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

  const MOV_DIAS_VENTANA_RECIENTE = 90;

  const cargarMovimientosFinanciamiento = async (traerTodoElHistorial = false) => {
    setCargandoMovimientos(true);
    let query = supabase
      .from('cta_cte_movimientos')
      .select(
        'id, fecha, cliente_id, tipo, concepto, monto, moneda, anulado, observacion, registrado_por_nombre, sucursal_id, orden_id, clientes ( nombre, apellido ), financiacion_cuotas ( numero ), pagos ( medio )'
      )
      .order('fecha', { ascending: false });
    if (!traerTodoElHistorial) {
      const desde = new Date();
      desde.setDate(desde.getDate() - MOV_DIAS_VENTANA_RECIENTE);
      query = query.gte('fecha', desde.toISOString());
    }
    const { data } = await query;
    setMovimientosFinanciamiento((data as any) ?? []);
    setCargandoMovimientos(false);
    setMovimientosCargados(true);
    if (traerTodoElHistorial) setMovHistorialCompleto(true);
  };

  useEffect(() => {
    if (filtroTipo === 'financiamiento' && !financiamientoCargado && !cargandoFinanciamiento) {
      cargarFinanciamiento();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo]);

  useEffect(() => {
    if (filtroTipo === 'financiamiento' && vistaFinanciamiento === 'movimientos' && !movimientosCargados && !cargandoMovimientos) {
      cargarMovimientosFinanciamiento();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, vistaFinanciamiento]);

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

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      const cod = (perfil as any)?.negocios?.moneda;
      if (cod) setMonedaNegocio(cod);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si la reparación se guardó con forma de pago "Cuenta corriente" (elegida
  // en su propia ficha de Servicio Técnico), este botón rápido tiene que
  // generar el cargo real en la cuenta corriente del cliente — si no, la
  // orden quedaría con la etiqueta "Cuenta corriente" sin que la deuda
  // exista de verdad. No ofrece financiar en cuotas acá (eso requiere el
  // formulario completo de la ficha) — siempre es un cargo único, como
  // "Financiar en cuotas propias" desactivado en Nueva Orden.
  const prepararCuentaCorrienteReparacion = async (
    r: ReparacionLista
  ): Promise<{ opciones?: { cuentaCorriente: CuentaCorrienteServicioTecnico }; error?: string }> => {
    if (r.forma_pago !== 'Cuenta corriente' || !r.cliente_id || r.orden_cobro_id) return {};
    const [{ data: cliente }, { data: movs }] = await Promise.all([
      supabase.from('clientes').select('cta_cte_habilitada, suspendido, limite_credito, plazo_dias').eq('id', r.cliente_id).single(),
      supabase.from('cta_cte_movimientos').select('tipo, monto').eq('cliente_id', r.cliente_id).eq('anulado', false),
    ]);
    const c = cliente as { cta_cte_habilitada: boolean; suspendido: boolean; limite_credito: number | null; plazo_dias: number | null } | null;
    if (!c?.cta_cte_habilitada || c.suspendido) {
      return { error: t('Este cliente no tiene cuenta corriente habilitada — se puede activar desde su ficha.') };
    }
    const saldo = calcularSaldo((movs as { tipo: string; monto: number }[]) ?? []);
    const creditoDisponible = c.limite_credito != null ? c.limite_credito - saldo : Infinity;
    const total = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
    if (total > creditoDisponible + 0.009) {
      return {
        error: `${t('Supera el límite de crédito (disponible')} ${monedaNegocio}${formatearMonto(Math.max(0, creditoDisponible))}). ${t(
          'No se puede confirmar hasta cobrarle o subirle el límite.'
        )}`,
      };
    }
    return { opciones: { cuentaCorriente: { moneda: monedaNegocio, plazoDias: c.plazo_dias } } };
  };

  const generarBoleta = async (r: ReparacionLista) => {
    if (!puedeVender || generando) return;
    if (!confirm(`${t('¿Generar la boleta de')} ${r.modelo || t('este equipo')}? ${t('Se cobra el importe de la reparación.')}`)) return;
    setGenerando(r.id);
    const { opciones: opcionesCtaCte, error: errorCtaCte } = await prepararCuentaCorrienteReparacion(r);
    if (errorCtaCte) {
      alert(errorCtaCte);
      setGenerando(null);
      return;
    }
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any, { sucursalId: sucursalActual.id, ...opcionesCtaCte });
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
    const { opciones: opcionesCtaCte, error: errorCtaCte } = await prepararCuentaCorrienteReparacion(r);
    if (errorCtaCte) {
      alert(errorCtaCte);
      setGenerando(null);
      return;
    }
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any, {
      marcarEntregado: false,
      sucursalId: sucursalActual.id,
      ...opcionesCtaCte,
    });
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

  // El saldo (y "en mora") siempre sale de saldosCtaCte — el libro mayor
  // real, cubre a cualquier cliente que deba plata, tenga o no un plan de
  // cuotas formal. financiacion_planes/cuotas solo aporta acá información
  // COMPLEMENTARIA (próximo vencimiento, moneda del plan, a qué venta
  // enlazar el cobro) cuando existe un plan activo — nunca decide el saldo
  // ni quién aparece en la lista.
  const resumenFinanciamiento = useMemo(() => {
    const cuotasPorPlan = new Map<string, CuotaFinanciamiento[]>();
    for (const c of cuotasFinanciamiento) {
      cuotasPorPlan.set(c.plan_id, [...(cuotasPorPlan.get(c.plan_id) ?? []), c]);
    }
    const infoPorCliente = new Map<
      string,
      { proximoVencimiento: string | null; cantidadPlanes: number; ordenOriginalId: string | null; moneda: string; cuotasPagas: number; cuotasTotal: number }
    >();
    for (const p of planesFinanciamiento) {
      const cuotas = (cuotasPorPlan.get(p.id) ?? []).filter((c) => c.estado !== 'anulada');
      const pendientes = cuotas.filter((c) => c.estado === 'pendiente').sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
      const proximoPlan = pendientes[0]?.fecha_vencimiento ?? null;
      const pagas = cuotas.filter((c) => c.estado === 'pagada').length;
      const existente = infoPorCliente.get(p.cliente_id);
      if (existente) {
        existente.cantidadPlanes += 1;
        existente.ordenOriginalId = null; // más de un plan activo: no hay una venta puntual a la que enlazar
        existente.cuotasPagas += pagas;
        existente.cuotasTotal += cuotas.length;
        if (proximoPlan && (!existente.proximoVencimiento || proximoPlan < existente.proximoVencimiento)) {
          existente.proximoVencimiento = proximoPlan;
        }
      } else {
        infoPorCliente.set(p.cliente_id, {
          proximoVencimiento: proximoPlan,
          cantidadPlanes: 1,
          ordenOriginalId: p.orden_id,
          moneda: p.moneda,
          cuotasPagas: pagas,
          cuotasTotal: cuotas.length,
        });
      }
    }
    return saldosCtaCte
      .map((s) => {
        const info = infoPorCliente.get(s.clienteId);
        const extra = carteraExtra.get(s.clienteId);
        return {
          clienteId: s.clienteId,
          clienteNombre: nombresClientesFinanciamiento.get(s.clienteId) ?? t('Cliente'),
          moneda: info?.moneda ?? monedaNegocio,
          saldo: s.saldo,
          proximoVencimiento: info?.proximoVencimiento ?? null,
          enMora: s.vencido > 0.009,
          cantidadPlanes: info?.cantidadPlanes ?? 0,
          ordenOriginalId: info?.ordenOriginalId ?? null,
          cuotasPagas: info?.cuotasTotal ? info.cuotasPagas : null,
          cuotasTotal: info?.cuotasTotal ?? null,
          ultimoPago: extra?.ultimoPago ?? null,
          sucursalUltimoPago: extra?.sucursalUltimoPago ?? null,
          diasAtraso: s.vencido > 0.009 ? diasDeMora(extra?.vencMasAntiguo ?? null) : null,
        };
      })
      .sort((a, b) => (a.proximoVencimiento ?? '9999-99-99').localeCompare(b.proximoVencimiento ?? '9999-99-99'));
  }, [planesFinanciamiento, cuotasFinanciamiento, saldosCtaCte, nombresClientesFinanciamiento, monedaNegocio, carteraExtra, t]);

  // Cajeros que realmente aparecen en lo cargado — no tiene sentido ofrecer
  // en el filtro a alguien que nunca cobró nada en la ventana visible.
  const cajerosFinanciamiento = useMemo(
    () => Array.from(new Set(movimientosFinanciamiento.map((m) => m.registrado_por_nombre).filter((n): n is string => !!n))).sort(),
    [movimientosFinanciamiento]
  );

  const movimientosFiltrados = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioDia = (offsetDias: number) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() - offsetDias);
      return d;
    };
    return movimientosFinanciamiento.filter((m) => {
      if (filtroMovFecha !== 'todo') {
        const fechaMov = new Date(m.fecha);
        if (filtroMovFecha === 'hoy' && fechaMov < inicioDia(0)) return false;
        if (filtroMovFecha === 'ayer' && (fechaMov < inicioDia(1) || fechaMov >= inicioDia(0))) return false;
        if (filtroMovFecha === 'semana' && fechaMov < inicioDia(7)) return false;
        if (filtroMovFecha === 'mes' && fechaMov < inicioDia(30)) return false;
      }
      if (filtroMovSucursal && m.sucursal_id !== filtroMovSucursal) return false;
      if (filtroMovCajero && m.registrado_por_nombre !== filtroMovCajero) return false;
      if (filtroMovForma && (m.pagos?.medio ?? '') !== filtroMovForma) return false;
      return true;
    });
  }, [movimientosFinanciamiento, filtroMovFecha, filtroMovSucursal, filtroMovCajero, filtroMovForma]);

  // Exporta exactamente lo que se está viendo (respeta los filtros activos),
  // no todo lo cargado — pedido real de un cliente para poder auditar un
  // período puntual en Excel.
  const exportarMovimientosExcel = async () => {
    setExportandoMovimientos(true);
    try {
      const filas = movimientosFiltrados.map((m) => ({
        fecha_hora: formatearFechaHora(m.fecha, locale),
        cliente: m.clientes ? `${m.clientes.nombre} ${m.clientes.apellido || ''}`.trim() : '',
        tipo: m.concepto === 'venta' ? t('Venta a cuenta corriente') : m.concepto === 'pago' ? t('Pago recibido') : m.concepto,
        cuota: m.financiacion_cuotas ? m.financiacion_cuotas.numero : '',
        monto: m.tipo === 'cargo' ? m.monto : -m.monto,
        moneda: m.moneda,
        forma_pago: m.pagos?.medio ? medioLabel(m.pagos.medio, t) : '',
        cobrado_por: m.registrado_por_nombre ?? '',
        sucursal: m.sucursal_id ? sucursales.find((s) => s.id === m.sucursal_id)?.nombre ?? '' : '',
        anulado: m.anulado ? t('Sí') : t('No'),
      }));
      await descargarXLSX(
        `movimientos-financiamiento-${new Date().toISOString().slice(0, 10)}.xlsx`,
        ['fecha_hora', 'cliente', 'tipo', 'cuota', 'monto', 'moneda', 'forma_pago', 'cobrado_por', 'sucursal', 'anulado'],
        filas
      );
    } catch (err: any) {
      alert(t('No pudimos exportar:') + ' ' + (err?.message ?? t('error desconocido')));
    }
    setExportandoMovimientos(false);
  };

  // Agrupado por día (más reciente primero), con el total ABONADO de cada
  // día — pedido real de un cliente: ver de un vistazo cuánto entró por día
  // sin tener que sumar tarjeta por tarjeta.
  const movimientosPorDia = useMemo(() => {
    const grupos = new Map<string, { fechaLabel: string; movimientos: MovimientoFinanciamiento[]; totalAbonado: number }>();
    for (const m of movimientosFiltrados) {
      const clave = new Date(m.fecha).toLocaleDateString('en-CA'); // YYYY-MM-DD estable para ordenar/agrupar
      if (!grupos.has(clave)) grupos.set(clave, { fechaLabel: new Date(m.fecha).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }), movimientos: [], totalAbonado: 0 });
      const g = grupos.get(clave)!;
      g.movimientos.push(m);
      if (m.tipo === 'abono' && !m.anulado) g.totalAbonado += m.monto;
    }
    return Array.from(grupos.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([clave, g]) => ({ clave, ...g }));
  }, [movimientosFiltrados, locale]);

  // Opciones concretas para elegir A QUÉ se aplica el cobro del cliente
  // abierto en el modal: la cuenta corriente "pura" (lo que no corresponde a
  // ninguna cuota puntual) y cada cuota de financiación pendiente, por
  // separado. Antes no existía esta elección — el pago se repartía solo
  // entre cuotas pendientes sin importar si el cliente lo estaba pagando
  // para la cuenta corriente.
  const opcionesCobro = useMemo(() => {
    if (!cobrando) return { cuentaCorrientePura: 0, cuotas: [] as CuotaFinanciamiento[] };
    const planesDelCliente = new Set(
      planesFinanciamiento.filter((p) => p.cliente_id === cobrando.clienteId && p.moneda === cobrando.moneda).map((p) => p.id)
    );
    const cuotasPendientes = cuotasFinanciamiento
      .filter((c) => planesDelCliente.has(c.plan_id) && c.estado === 'pendiente' && c.importe_original - c.importe_pagado > 0.009)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    const totalCuotas = cuotasPendientes.reduce((acc, c) => acc + (c.importe_original - c.importe_pagado), 0);
    return { cuentaCorrientePura: Math.max(0, cobrando.saldo - totalCuotas), cuotas: cuotasPendientes };
  }, [cobrando, planesFinanciamiento, cuotasFinanciamiento]);

  const abrirCobro = (r: ResumenFinanciamiento) => {
    setCobrando(r);
    setCobroMonto(String(r.saldo));
    setCobroMedio('efectivo');
    setCobroObs('');
    setErrorCobro(null);
    setCobroDestino('');
  };

  // Si el cliente solo tiene UNA opción posible (o cuenta corriente sola, o
  // una sola cuota pendiente), se preselecciona — no tiene sentido obligar a
  // elegir cuando no hay ninguna ambigüedad real.
  useEffect(() => {
    if (!cobrando || cobroDestino) return;
    const { cuentaCorrientePura, cuotas } = opcionesCobro;
    if (cuentaCorrientePura > 0.009 && cuotas.length === 0) setCobroDestino('cuenta_corriente');
    else if (cuentaCorrientePura <= 0.009 && cuotas.length === 1) setCobroDestino(cuotas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrando, opcionesCobro]);

  const confirmarCobro = async () => {
    if (!cobrando) return;
    const monto = Number(cobroMonto);
    if (!monto || monto <= 0) {
      setErrorCobro(t('Poné un monto mayor a cero.'));
      return;
    }
    if (!cobroDestino) {
      setErrorCobro(t('Elegí a qué se aplica este cobro: cuenta corriente o una cuota puntual.'));
      return;
    }
    // Bug real reportado por un cliente (2026-09): el monto quedaba editable
    // sin límite después de elegir el destino, así que un cobro que en
    // realidad cubría una cuota podía cargarse igual como "cuenta corriente,
    // sin tocar cuotas" (o al revés, de más sobre una cuota puntual) — la
    // cuota seguía figurando impaga aunque el cliente ya hubiera pagado. Acá
    // se pone un techo duro: cada destino no puede recibir más de lo que
    // realmente representa.
    if (cobroDestino === 'cuenta_corriente' && monto > opcionesCobro.cuentaCorrientePura + 0.01) {
      setErrorCobro(
        `${t('La cuenta corriente (sin cuota) cubre hasta')} ${simboloMoneda(cobrando.moneda)}${formatearMonto(
          opcionesCobro.cuentaCorrientePura
        )} — ${t('el resto corresponde a una cuota. Elegí la cuota o ajustá el monto.')}`
      );
      return;
    }
    const cuotaElegida = opcionesCobro.cuotas.find((c) => c.id === cobroDestino);
    if (cuotaElegida) {
      const saldoCuotaElegida = cuotaElegida.importe_original - cuotaElegida.importe_pagado;
      if (monto > saldoCuotaElegida + 0.01) {
        setErrorCobro(
          `${t('Esta cuota tiene un saldo de')} ${simboloMoneda(cobrando.moneda)}${formatearMonto(saldoCuotaElegida)} — ${t(
            'si el cliente pagó de más, registrá el resto como otro cobro (otra cuota o cuenta corriente).'
          )}`
        );
        return;
      }
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
      ...(cobroDestino === 'cuenta_corriente' ? { omitirFinanciacion: true } : { cuotaIdElegida: cobroDestino }),
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
    // El cobro y la boleta YA se guardaron bien — esto solo avisa que el
    // reparto a cuotas puntuales quedó pendiente. Un alert() es lo único
    // que sigue siendo visible después de la navegación de abajo (un error
    // puesto en el estado de esta pantalla desaparecería con ella).
    if (resultado.avisoCuotas) alert('⚠️ ' + resultado.avisoCuotas);
    router.push(`/ordenes/${resultado.ordenId}/boleta`);
  };

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenes
      .filter((o) => filtroEstado === 'todas' || o.estado === filtroEstado)
      .filter((o) => !filtroSucursal || o.sucursal_id === filtroSucursal)
      .filter((o) => {
        if (filtroTipo === 'todas') return true;
        // Pedido real de un cliente: la pestaña Financiamiento mostraba solo
        // el resumen de "quién me debe", nunca el historial de boletas de
        // cobros ya hechos — un dueño que vuelve a revisar (no estuvo en el
        // mostrador cuando un empleado cobró) no tenía dónde auditarlo. Se
        // filtra igual que "servicio" para reusar esta misma lista de
        // tarjetas debajo del resumen de saldos.
        if (filtroTipo === 'financiamiento') return esCobroFinanciamiento(o);
        if (filtroTipo === 'servicio') return esServicioTecnico(o);
        // "Ventas" = ni servicio técnico ni un cobro de financiamiento/cta
        // corriente — sin este segundo chequeo, las boletas que genera el
        // botón "Cobrar" de la pestaña Financiamiento aparecían mezcladas
        // acá como si fueran una venta de producto más.
        return !esServicioTecnico(o) && !esCobroFinanciamiento(o);
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

      {filtroTipo === 'financiamiento' && (
        <>
          <div className="flex gap-1.5 mb-1">
            {(['movimientos', 'cartera'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVistaFinanciamiento(v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  vistaFinanciamiento === v ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {v === 'movimientos' ? t('Movimientos') : t('Cartera')}
              </button>
            ))}
          </div>

          {vistaFinanciamiento === 'movimientos' && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'hoy', label: 'Hoy' },
                    { id: 'ayer', label: 'Ayer' },
                    { id: 'semana', label: 'Semana' },
                    { id: 'mes', label: 'Mes' },
                    { id: 'todo', label: 'Todo' },
                  ] as const
                ).map((op) => (
                  <button
                    key={op.id}
                    onClick={() => setFiltroMovFecha(op.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      filtroMovFecha === op.id ? 'bg-ink dark:bg-dark-text text-white dark:text-dark-bg' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {t(op.label)}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {sucursales.length > 1 && (
                  <select
                    value={filtroMovSucursal}
                    onChange={(e) => setFiltroMovSucursal(e.target.value)}
                    className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="">{t('Todas las sucursales')}</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                )}
                {cajerosFinanciamiento.length > 1 && (
                  <select
                    value={filtroMovCajero}
                    onChange={(e) => setFiltroMovCajero(e.target.value)}
                    className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="">{t('Todos los cajeros')}</option>
                    {cajerosFinanciamiento.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={filtroMovForma}
                  onChange={(e) => setFiltroMovForma(e.target.value)}
                  className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">{t('Todas las formas de pago')}</option>
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {medioLabel(m.codigo, t)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={exportarMovimientosExcel}
                  disabled={exportandoMovimientos || movimientosFiltrados.length === 0}
                  className="rounded-lg border border-border dark:border-dark-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ml-auto"
                >
                  {exportandoMovimientos ? t('Exportando...') : `📊 ${t('Exportar a Excel')}`}
                </button>
              </div>

              {cargandoMovimientos && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
              )}
              {!cargandoMovimientos && movimientosPorDia.length === 0 && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                  {t('No hay movimientos de cuenta corriente en este período.')}
                </p>
              )}
              <div className="flex flex-col gap-4">
                {movimientosPorDia.map((dia) => (
                  <div key={dia.clave} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between px-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary capitalize">
                        {dia.fechaLabel} · {dia.movimientos.length}
                      </p>
                      {dia.totalAbonado > 0.009 && (
                        <p className="text-xs font-semibold text-good">
                          +{simboloMoneda(monedaNegocio)}{formatearMonto(dia.totalAbonado)}
                        </p>
                      )}
                    </div>
                    {dia.movimientos.map((m) => {
                      const esCargo = m.tipo === 'cargo';
                      const clienteNombre = m.clientes ? `${m.clientes.nombre} ${m.clientes.apellido || ''}`.trim() : t('Cliente');
                      const tipoLabel =
                        m.concepto === 'venta'
                          ? t('Venta a cuenta corriente')
                          : m.concepto === 'pago'
                            ? t('Pago recibido')
                            : m.concepto.replace('_', ' ');
                      return (
                        <div
                          key={m.id}
                          className={`rounded-xl border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3 ${
                            m.anulado ? 'border-bad/30 opacity-60' : 'border-border dark:border-dark-border'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              <Link href={`/clientes/${m.cliente_id}`} className="hover:underline">
                                {clienteNombre}
                              </Link>
                              {m.anulado && <span className="ml-1.5 text-[10px] font-semibold text-bad">{t('ANULADO')}</span>}
                            </p>
                            <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                              {formatearFechaHora(m.fecha, locale)} · {tipoLabel}
                              {m.financiacion_cuotas && ` · ${t('Cuota')} ${m.financiacion_cuotas.numero}`}
                            </p>
                            <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                              {[
                                m.pagos?.medio ? medioLabel(m.pagos.medio, t) : null,
                                m.registrado_por_nombre,
                                m.sucursal_id ? sucursales.find((s) => s.id === m.sucursal_id)?.nombre : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-semibold ${esCargo ? 'text-bad' : 'text-good'}`}>
                              {esCargo ? '+' : '−'}
                              {simboloMoneda(m.moneda)}{formatearMonto(m.monto)}
                            </p>
                            {m.orden_id && (
                              <Link href={`/ordenes/${m.orden_id}`} className="text-[10px] text-accent dark:text-dark-accent underline">
                                {t('Ver orden')}
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {!movHistorialCompleto && (
                <button
                  onClick={() => cargarMovimientosFinanciamiento(true)}
                  disabled={cargandoMovimientos}
                  className="w-full rounded-xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium disabled:opacity-40"
                >
                  {cargandoMovimientos ? t('Cargando…') : t('Ver todo el historial')}
                </button>
              )}
            </>
          )}

          {vistaFinanciamiento === 'cartera' && (
            <>
          {cargandoFinanciamiento && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
          )}
          {!cargandoFinanciamiento && resumenFinanciamiento.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {t('No hay clientes que deban plata en cuenta corriente.')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {resumenFinanciamiento.map((r) => (
              <div
                key={r.clienteId}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.clienteNombre}</p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {t('Saldo')}: {simboloMoneda(r.moneda)}
                    {formatearMonto(r.saldo)}
                    {r.cantidadPlanes > 1 && ` · ${r.cantidadPlanes} ${t('planes')}`}
                  </p>
                  {/* enMora sale del saldo real (vencido > 0), independiente
                      de si hay un plan de cuotas con próximo vencimiento —
                      un fiado simple vencido también tiene que marcarse acá. */}
                  {(r.enMora || r.proximoVencimiento) && (
                    <p className={`text-xs mt-0.5 ${r.enMora ? 'text-bad font-medium' : 'text-muted dark:text-dark-text-secondary'}`}>
                      {r.enMora
                        ? r.proximoVencimiento
                          ? `${t('Vencida desde')}: ${new Date(r.proximoVencimiento + 'T00:00:00').toLocaleDateString(locale)}`
                          : t('Tiene saldo vencido')
                        : `${t('Próximo vencimiento')}: ${new Date(r.proximoVencimiento! + 'T00:00:00').toLocaleDateString(locale)}`}
                      {r.enMora && r.diasAtraso != null && ` · ${r.diasAtraso} ${t('días')}`}
                    </p>
                  )}
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate mt-0.5">
                    {[
                      r.cuotasTotal != null ? `${t('Cuotas')} ${r.cuotasPagas}/${r.cuotasTotal}` : null,
                      r.ultimoPago
                        ? `${t('Último pago')}: ${new Date(r.ultimoPago).toLocaleDateString(locale)}${
                            r.sucursalUltimoPago ? ` (${sucursales.find((s) => s.id === r.sucursalUltimoPago)?.nombre ?? ''})` : ''
                          }`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
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

          {/* Historial de boletas de cobros ya hechos — pedido real de un
              cliente: poder auditar después (sin haber estado presente
              cuando un empleado cobró) qué se cobró, a quién y cuándo,
              mismo criterio que ya tienen las boletas de Ventas/Servicio
              técnico acá abajo. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary mt-2">
            {t('Boletas de cobros')}
          </p>
            </>
          )}
        </>
      )}

      {(filtroTipo !== 'financiamiento' || vistaFinanciamiento === 'cartera') && (
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

          {(opcionesCobro.cuentaCorrientePura > 0.009 || opcionesCobro.cuotas.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted dark:text-dark-text-secondary">
                {t('¿A qué se aplica este cobro?')}
              </label>
              <div className="flex flex-col gap-1.5">
                {opcionesCobro.cuentaCorrientePura > 0.009 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCobroDestino('cuenta_corriente');
                      setCobroMonto(String(opcionesCobro.cuentaCorrientePura));
                    }}
                    className={`text-left rounded-lg border px-3 py-2 text-sm ${
                      cobroDestino === 'cuenta_corriente'
                        ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                        : 'border-border dark:border-dark-border'
                    }`}
                  >
                    {t('Cuenta corriente (sin cuota puntual)')} — {simboloMoneda(cobrando.moneda)}
                    {formatearMonto(opcionesCobro.cuentaCorrientePura)}
                  </button>
                )}
                {opcionesCobro.cuotas.map((c) => {
                  const saldoCuota = c.importe_original - c.importe_pagado;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCobroDestino(c.id);
                        setCobroMonto(String(saldoCuota));
                      }}
                      className={`text-left rounded-lg border px-3 py-2 text-sm ${
                        cobroDestino === c.id
                          ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                          : 'border-border dark:border-dark-border'
                      }`}
                    >
                      {t('Cuota')} {c.numero} — {t('vence')} {new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString(locale)} —{' '}
                      {simboloMoneda(cobrando.moneda)}
                      {formatearMonto(saldoCuota)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
              disabled={guardandoCobro || !cobroDestino}
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
