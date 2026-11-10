'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { estadoCuenta, ESTADO_INFO } from '../lib/cuentaCorriente';
import { obtenerTodasLasFilas } from '../lib/db';
import { QCard } from '../QCard';
import { EvolucionBarras } from '../estadisticas/graficos';
import { proyeccionMensual, alertasCuotas, aFechaISO, type CuotaProyeccion, type PagoAplicadoProyeccion, type AlertaCuota } from '../lib/financiacion/motor';
import { armarLinkWhatsApp, mensajeRecordatorioCobranza } from '../lib/whatsapp';
import { codigoLlamada } from '../lib/paises';
import { formatearMonto } from '../lib/numeros';
import { useT } from '../lib/idioma';
import FiltroLocalidad from '../FiltroLocalidad';
import { opcionesLocalidad, coincideLocalidad } from '../lib/localidades';
import { leerMoraSql, type FilaMoraSql } from '../lib/mora';
import { soportaMigracion } from '../lib/migraciones';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { clientesQuePagaronEsteMes, obtenerCronograma } from '../lib/clienteCobroDatos';
import { coincideDatosCobro, diaDeCobro, FILTROS_VACIOS, yaCobroNoPago, type Cronograma, type DatosCobro, type FiltrosCliente } from '../lib/clienteCobro';
import FiltrosClientes, { EtiquetaCalidad, EtiquetaYaCobro, useFiltroSucursal } from '../FiltrosClientes';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  suspendido: boolean | null;
  telefono: string | null;
  localidad: string | null;
  dni?: string | null;
  // Solo vienen si el negocio corrió financiacion_guia_cartera_supabase.sql / clientes_cobro_supabase.sql.
  sucursal_origen_id?: string | null;
} & DatosCobro;
type Saldo = FilaMoraSql & { cliente_id: string; saldo: number; vencido: number };

type Fila = {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  vencido: number;
  suspendido: boolean;
  localidad: string | null;
  // Próximo vencimiento real según la base (pagos imputados a la deuda más vieja). undefined = la base todavía tiene el cálculo viejo.
  proximoSql?: { fecha: string; monto: number } | null;
};

type CuotaFila = {
  id: string;
  plan_id: string;
  numero: number;
  cantidad_cuotas: number;
  fecha_vencimiento: string;
  importe_original: number;
  importe_pagado: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
  cliente_id: string;
  moneda: string;
};

export default function CuentasPorCobrar() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  // Misma llave que Estadísticas: es información sensible de plata.
  const puedeVer = tienePermiso(actor, 'ver_estadisticas');

  const [filasRaw, setFilas] = useState<Fila[]>([]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [codigoPais, setCodigoPais] = useState('54');
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState<'saldo' | 'vencido' | 'nombre' | 'vencimiento'>('vencimiento');

  // ---------- Proyección de cobranzas (financiación en cuotas) ----------
  const [cuotasRaw, setCuotas] = useState<CuotaFila[]>([]);
  const [pagosRaw, setPagosAplicados] = useState<PagoAplicadoProyeccion[]>([]);
  const [nombresClientes, setNombresClientes] = useState<Map<string, string>>(new Map());
  const [monedaProyeccion, setMonedaProyeccion] = useState<string | null>(null);
  const [horizonte, setHorizonte] = useState<6 | 12>(6);
  const [alertasDescartadas, setAlertasDescartadas] = useState<Set<string>>(new Set());
  const [alertasAbiertas, setAlertasAbiertas] = useState(false);

  const moneda = useMemo(() => simboloMoneda(monedaCodigo), [monedaCodigo]);

  // Filtro por localidad/zona (recorridos de cobranza): recorta la planilla de
  // deudores, la mora, las alertas y la proyección a los clientes de esa zona.
  const [filtroLocalidad, setFiltroLocalidad] = useState('');
  const [localidadPorCliente, setLocalidadPorCliente] = useState<Map<string, string | null>>(new Map());
  const localidadesDisponibles = useMemo(() => opcionesLocalidad(Array.from(localidadPorCliente.values())), [localidadPorCliente]);

  // Sucursal de origen, fuente de ingreso, rango de pago, calidad y "ya cobró – no pagó" (si el negocio corrió esos SQL).
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [conOrigen, setConOrigen] = useState(false);
  const [conDatosCobro, setConDatosCobro] = useState(false);
  const [cronograma, setCronograma] = useState<Cronograma | null>(null);
  const [pagaronEsteMes, setPagaronEsteMes] = useState<Set<string>>(new Set());
  const [infoClientes, setInfoClientes] = useState<Map<string, Cliente>>(new Map());
  const [filtroSucursal, setFiltroSucursal] = useFiltroSucursal();
  const [filtrosCobro, setFiltrosCobro] = useState<FiltrosCliente>(FILTROS_VACIOS);
  // Sin el SQL de sucursal de origen no hay nada que filtrar (si no, el filtro dejaría a todos afuera).
  const filtros: FiltrosCliente = { ...filtrosCobro, sucursal: conOrigen ? filtroSucursal : '' };
  const cambiarFiltros = (f: FiltrosCliente) => {
    setFiltroSucursal(f.sucursal);
    setFiltrosCobro(f);
  };

  // Clientes marcados "ya cobró – no pagó" (sobre todos los que deben, sin importar los demás filtros).
  const idsYaCobroNoPago = useMemo(() => {
    const ids = new Set<string>();
    if (!conDatosCobro) return ids;
    const hoy = new Date();
    for (const f of filasRaw) {
      const c = infoClientes.get(f.id);
      const dia = c ? diaDeCobro(c, cronograma) : null;
      if (!dia) continue;
      if (yaCobroNoPago({ diaCobro: dia.dia, hoy, saldo: f.saldo, vencido: f.vencido, proximoVencimiento: f.proximoSql?.fecha ?? null, pagoEsteMes: pagaronEsteMes.has(f.id) })) ids.add(f.id);
    }
    return ids;
  }, [filasRaw, infoClientes, cronograma, pagaronEsteMes, conDatosCobro]);

  const hayFiltro = !!filtroLocalidad || !!filtros.sucursal || !!filtros.fuente || !!filtros.rango || !!filtros.calificacion || filtros.soloYaCobroNoPago;
  const clienteVisible = (id: string) =>
    coincideLocalidad(localidadPorCliente.get(id), filtroLocalidad) &&
    coincideDatosCobro(infoClientes.get(id) ?? {}, filtros) &&
    (!filtros.soloYaCobroNoPago || idsYaCobroNoPago.has(id));
  const filas = useMemo(() => (hayFiltro ? filasRaw.filter((f) => clienteVisible(f.id)) : filasRaw), [filasRaw, hayFiltro, filtroLocalidad, localidadPorCliente, infoClientes, filtroSucursal, filtrosCobro, conOrigen, idsYaCobroNoPago]);
  const cuotas = useMemo(() => (hayFiltro ? cuotasRaw.filter((c) => clienteVisible(c.cliente_id)) : cuotasRaw), [cuotasRaw, hayFiltro, filtroLocalidad, localidadPorCliente, infoClientes, filtroSucursal, filtrosCobro, conOrigen, idsYaCobroNoPago]);
  const pagosAplicados = useMemo(
    () => (hayFiltro ? pagosRaw.filter((p) => clienteVisible(p.cliente_id)) : pagosRaw),
    [pagosRaw, hayFiltro, filtroLocalidad, localidadPorCliente, infoClientes, filtroSucursal, filtrosCobro, conOrigen, idsYaCobroNoPago]
  );

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    (async () => {
      // clientes se trae paginado (no un select() común): con miles de
      // clientes, un select() común se corta en 1000 filas sin avisar y los
      // deudores que quedaran afuera de esa página aparecerían como
      // "Cliente eliminado" sin estarlo de verdad.
      const [{ data: saldosData }, clientesData, { data: userData }, cuotasData, pagosData] = await Promise.all([
        supabase.rpc('saldos_cuenta_corriente'),
        (async () => {
          const [origen, cobro] = await Promise.all([soportaMigracion(supabase, 'clienteSucursalOrigen'), soportaMigracion(supabase, 'clienteCobro')]);
          setConOrigen(origen);
          setConDatosCobro(cobro);
          const columnas = ['id, nombre, apellido, suspendido, telefono, localidad', origen ? 'sucursal_origen_id' : '', cobro ? 'dni, fuente_ingreso, dia_cobro, rango_pago, calificacion' : '']
            .filter(Boolean)
            .join(', ');
          return obtenerTodasLasFilas<Cliente>(supabase, 'clientes', columnas);
        })(),
        supabase.auth.getUser(),
        obtenerTodasLasFilas<any>(
          supabase,
          'financiacion_cuotas',
          'id, plan_id, numero, fecha_vencimiento, importe_original, importe_pagado, estado, financiacion_planes!inner(cliente_id, moneda, cantidad_cuotas)'
        ),
        // Solo pagos reales (tipo='pago', no 'ajuste' — un ajuste no es plata
        // que entró, no cuenta como "cobrado" en la proyección).
        obtenerTodasLasFilas<any>(
          supabase,
          'financiacion_pagos',
          'monto_aplicado, tipo, pagos!inner(fecha), financiacion_cuotas!inner(plan_id, financiacion_planes!inner(cliente_id, moneda))',
          [],
          (q) => q.eq('tipo', 'pago')
        ),
      ]);
      const clientes = new Map(clientesData.map((c) => [c.id, c]));
      const armadas: Fila[] = ((saldosData as Saldo[]) ?? [])
        .map((s) => {
          const c = clientes.get(s.cliente_id);
          const saldo = Number(s.saldo) || 0;
          const mora = leerMoraSql(s);
          return {
            id: s.cliente_id,
            nombre: c ? `${c.nombre} ${c.apellido || ''}`.trim() : t('Cliente eliminado'),
            telefono: c?.telefono ?? null,
            saldo,
            vencido: mora ? mora.vencido : Number(s.vencido) || 0,
            proximoSql: mora ? (mora.proximoVencimiento ? { fecha: mora.proximoVencimiento, monto: mora.proximoMonto ?? 0 } : null) : undefined,
            suspendido: !!c?.suspendido,
            localidad: c?.localidad ?? null,
          };
        })
        .filter((f) => f.saldo > 0.009);
      setFilas(armadas);

      setNombresClientes(new Map(clientesData.map((c) => [c.id, `${c.nombre} ${c.apellido || ''}`.trim()])));
      setLocalidadPorCliente(new Map(clientesData.map((c) => [c.id, c.localidad])));
      setInfoClientes(clientes);
      obtenerSucursales(supabase).then(setSucursales);
      obtenerCronograma(supabase).then(setCronograma);
      clientesQuePagaronEsteMes(supabase).then(setPagaronEsteMes);
      setCuotas(
        ((cuotasData as any[]) ?? []).map((c) => ({
          id: c.id,
          plan_id: c.plan_id,
          numero: c.numero,
          cantidad_cuotas: c.financiacion_planes?.cantidad_cuotas ?? 1,
          fecha_vencimiento: c.fecha_vencimiento,
          importe_original: c.importe_original,
          importe_pagado: c.importe_pagado,
          estado: c.estado,
          cliente_id: c.financiacion_planes?.cliente_id,
          moneda: c.financiacion_planes?.moneda ?? 'ARS',
        }))
      );
      setPagosAplicados(
        ((pagosData as any[]) ?? []).map((p) => ({
          cliente_id: p.financiacion_cuotas?.financiacion_planes?.cliente_id,
          moneda: p.financiacion_cuotas?.financiacion_planes?.moneda ?? 'ARS',
          // Fecha REAL local del pago (no un slice de un timestamptz en UTC,
          // que podría correrse un día según la hora) — mismo criterio de
          // fechas locales que el resto del motor.
          fecha_pago: p.pagos?.fecha ? aFechaISO(new Date(p.pagos.fecha)) : '',
          monto: p.monto_aplicado,
        }))
      );

      if (userData?.user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( moneda, pais )')
          .eq('id', userData.user.id)
          .single();
        const cod = (perfil as any)?.negocios?.moneda;
        if (cod) setMonedaCodigo(cod);
        setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  // Descartar una alerta es una preferencia de ESTE navegador, no un cambio
  // real en la base (no existe una tabla de alertas) — mismo criterio que
  // las alertas de Servicio Técnico.
  const KEY_DESCARTADAS = 'qovento:cxc-alertas-descartadas';
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(KEY_DESCARTADAS);
      if (guardado) setAlertasDescartadas(new Set(JSON.parse(guardado)));
    } catch {}
  }, []);
  const descartarAlerta = (id: string) => {
    setAlertasDescartadas((prev) => {
      const nuevo = new Set(prev).add(id);
      try {
        localStorage.setItem(KEY_DESCARTADAS, JSON.stringify(Array.from(nuevo)));
      } catch {}
      return nuevo;
    });
  };

  // Monedas con financiación real (nunca se mezclan en la proyección).
  const monedasConCuotas = useMemo(() => Array.from(new Set(cuotas.filter((c) => c.estado !== 'anulada').map((c) => c.moneda))), [cuotas]);
  useEffect(() => {
    if (monedaProyeccion === null && monedasConCuotas.length > 0) {
      setMonedaProyeccion(monedasConCuotas.includes(monedaCodigo) ? monedaCodigo : monedasConCuotas[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monedasConCuotas, monedaCodigo]);

  const cuotasParaMotor: CuotaProyeccion[] = useMemo(
    () => cuotas.map((c) => ({ cliente_id: c.cliente_id, moneda: c.moneda, fecha_vencimiento: c.fecha_vencimiento, importe_original: c.importe_original, importe_pagado: c.importe_pagado, estado: c.estado })),
    [cuotas]
  );

  const proyeccion = useMemo(() => {
    if (!monedaProyeccion) return [];
    const filtradas = cuotasParaMotor.filter((c) => c.moneda === monedaProyeccion);
    const pagosFiltrados = pagosAplicados.filter((p) => p.moneda === monedaProyeccion);
    return proyeccionMensual({ cuotas: filtradas, pagosAplicados: pagosFiltrados, horizonteMeses: horizonte, hoy: new Date(), decimales: 0 });
  }, [cuotasParaMotor, pagosAplicados, monedaProyeccion, horizonte]);

  const mesActual = proyeccion[0];
  const pctCobradoMes = mesActual && mesActual.programado > 0.009 ? Math.round((mesActual.cobrado / mesActual.programado) * 100) : null;

  const alertas: AlertaCuota[] = useMemo(() => {
    const conNombre = cuotas
      .filter((c) => c.estado === 'pendiente')
      .map((c) => ({
        id: c.id,
        cliente_id: c.cliente_id,
        clienteNombre: nombresClientes.get(c.cliente_id) ?? t('Cliente eliminado'),
        plan_id: c.plan_id,
        numero: c.numero,
        cuotaTotal: c.cantidad_cuotas,
        moneda: c.moneda,
        fecha_vencimiento: c.fecha_vencimiento,
        importe_original: c.importe_original,
        importe_pagado: c.importe_pagado,
        estado: c.estado,
      }));
    return alertasCuotas(conNombre, new Date()).filter((a) => !alertasDescartadas.has(a.id));
  }, [cuotas, nombresClientes, alertasDescartadas]);

  // Próxima cuota pendiente de cada cliente — para poder ordenar "quién vence
  // primero" y verlo de un vistazo en la planilla, en vez de tener que abrir
  // la ficha de cada uno. Solo cubre financiación en cuotas propias (que es
  // la que tiene fecha por cuota); una venta a cuenta corriente simple no
  // tiene ese desglose, así que esos clientes quedan sin fecha (se ordenan
  // al final al elegir "Próximo vencimiento").
  const proximoVencPorCliente = useMemo(() => {
    // Con el cálculo nuevo de la base (mora_fifo_supabase.sql) el próximo vencimiento sale de la cuenta corriente, con los pagos
    // ya imputados a lo más viejo: así la tarjeta no muestra una cuota vieja que en la cuenta ya está cubierta. Si ese vencimiento
    // coincide con una cuota del plan, se muestra también su número.
    if (filas.some((f) => f.proximoSql !== undefined)) {
      const cuotaPorFecha = new Map<string, CuotaFila>();
      for (const c of cuotas) if (c.estado === 'pendiente') cuotaPorFecha.set(`${c.cliente_id}|${c.fecha_vencimiento}`, c);
      const desdeSql = new Map<string, { fecha: string; monto: number; numero?: number; total?: number }>();
      for (const f of filas) {
        if (!f.proximoSql) continue;
        const cuota = cuotaPorFecha.get(`${f.id}|${f.proximoSql.fecha}`);
        desdeSql.set(f.id, { fecha: f.proximoSql.fecha, monto: f.proximoSql.monto, numero: cuota?.numero, total: cuota?.cantidad_cuotas });
      }
      return desdeSql;
    }
    const mapa = new Map<string, { fecha: string; monto: number; numero?: number; total?: number }>();
    for (const c of cuotas) {
      if (c.estado !== 'pendiente') continue;
      const actual = mapa.get(c.cliente_id);
      if (!actual || c.fecha_vencimiento < actual.fecha) {
        mapa.set(c.cliente_id, { fecha: c.fecha_vencimiento, monto: c.importe_original - c.importe_pagado, numero: c.numero, total: c.cantidad_cuotas });
      }
    }
    return mapa;
  }, [cuotas, filas]);

  const ordenadas = useMemo(() => {
    const copia = [...filas];
    if (orden === 'nombre') copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (orden === 'vencido') copia.sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
    else if (orden === 'vencimiento') {
      copia.sort((a, b) => {
        const fa = proximoVencPorCliente.get(a.id)?.fecha;
        const fb = proximoVencPorCliente.get(b.id)?.fecha;
        if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
        if (fa) return -1;
        if (fb) return 1;
        return b.saldo - a.saldo;
      });
    } else copia.sort((a, b) => b.saldo - a.saldo);
    return copia;
  }, [filas, orden, proximoVencPorCliente]);

  const totalPorCobrar = filas.reduce((acc, f) => acc + f.saldo, 0);
  const totalVencido = filas.reduce((acc, f) => acc + f.vencido, 0);
  const fmt = (n: number) => `${moneda}${formatearMonto(n)}`;

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Cuentas por cobrar.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Cuentas por cobrar')}</span>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FiltroLocalidad opciones={localidadesDisponibles} value={filtroLocalidad} onChange={setFiltroLocalidad} />
        <FiltrosClientes
          filtros={filtros}
          onChange={cambiarFiltros}
          sucursales={conOrigen ? sucursales : []}
          conDatosCobro={conDatosCobro}
          cantidadYaCobroNoPago={conDatosCobro ? idsYaCobroNoPago.size : undefined}
        />
        <Link href="/creditos-fuera-de-guia" className="ml-auto rounded-full border border-border dark:border-dark-border px-3 py-1.5 text-xs font-medium">
          🚩 {t('Créditos fuera de la guía')}
        </Link>
      </div>

      {alertas.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 flex flex-col overflow-hidden">
          <button onClick={() => setAlertasAbiertas((v) => !v)} className="flex items-center justify-between px-4 py-3 text-sm font-medium">
            <span>
              {alertas.length} {alertas.length === 1 ? t('cuota para atender (vencida o por vencer)') : t('cuotas para atender (vencidas o por vencer)')}
            </span>
            <span className="text-xs text-muted dark:text-dark-text-secondary">{alertasAbiertas ? t('Ocultar') : t('Ver')}</span>
          </button>
          {alertasAbiertas && (
            <div className="flex flex-col border-t border-warn/20">
              {alertas.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-white/40 dark:hover:bg-black/10">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${a.categoria === 'proxima_a_vencer' ? 'bg-warn' : 'bg-bad'}`} />
                  <Link href={`/clientes/${a.clienteId}`} className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{a.clienteNombre}</span> · {t('cuota')} {a.cuotaNumero}/{a.cuotaTotal} ·{' '}
                    {simboloMoneda(a.moneda)}
                    {formatearMonto(a.importe)} ·{' '}
                    {a.categoria === 'vencida'
                      ? `${t('vencida hace')} ${a.diasAtraso} ${a.diasAtraso === 1 ? t('día') : t('días')}`
                      : a.categoria === 'vence_hoy'
                      ? t('vence hoy')
                      : `${t('vence el')} ${new Date(a.fechaVencimiento + 'T00:00:00').toLocaleDateString('es-AR')}`}
                  </Link>
                  <button onClick={() => descartarAlerta(a.id)} className="shrink-0 text-muted dark:text-dark-text-secondary underline">
                    {t('Descartar')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <QCard firma microetiqueta={t('Total')}>
          <p className="text-2xl font-display font-semibold leading-none text-warn">{fmt(totalPorCobrar)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1.5">{t('Total por cobrar (plata en la calle)')}</p>
        </QCard>
        <QCard firma microetiqueta={t('Vencido')}>
          <p className={`text-2xl font-display font-semibold leading-none ${totalVencido > 0 ? 'text-bad' : ''}`}>{fmt(totalVencido)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1.5">{t('Vencido (a gestionar)')}</p>
        </QCard>
      </div>

      {/* Proyección de cobranzas: SOLO ingresos previstos de financiaciones en
          cuotas, no un flujo de caja completo — no se muestra si el negocio
          no tiene ninguna financiación cargada todavía (nada de datos
          inventados). */}
      {!loading && monedasConCuotas.length > 0 && monedaProyeccion && (
        <QCard padding="sm" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium" title={t('Ingresos previstos de tus cuotas por cobrar — no garantiza que el cliente pague, y no incluye ventas fuera de un plan de financiación.')}>
              {t('Proyección de cobranzas')}
            </p>
            <div className="flex items-center gap-1.5">
              {monedasConCuotas.length > 1 && (
                <select
                  value={monedaProyeccion}
                  onChange={(e) => setMonedaProyeccion(e.target.value)}
                  className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1 text-xs"
                >
                  {monedasConCuotas.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              {([6, 12] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizonte(h)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                    horizonte === h ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border'
                  }`}
                >
                  {h} {t('meses')}
                </button>
              ))}
            </div>
          </div>

          {mesActual && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <ResumenMes etiqueta={t('A cobrar este mes')} valor={`${simboloMoneda(monedaProyeccion)}${formatearMonto(mesActual.programado)}`} />
              <ResumenMes etiqueta={t('Cobrado este mes')} valor={`${simboloMoneda(monedaProyeccion)}${formatearMonto(mesActual.cobrado)}`} tono="text-good" />
              <ResumenMes etiqueta={t('Pendiente del mes')} valor={`${simboloMoneda(monedaProyeccion)}${formatearMonto(mesActual.pendiente)}`} tono={mesActual.pendiente > 0 ? 'text-warn' : undefined} />
              <ResumenMes etiqueta={t('% cobrado del mes')} valor={pctCobradoMes != null ? `${pctCobradoMes}%` : '—'} />
            </div>
          )}

          <EvolucionBarras datos={proyeccion.map((m) => ({ label: etiquetaMesCorta(m.mes, t), valor: m.pendiente }))} moneda={simboloMoneda(monedaProyeccion)} />

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="text-left text-muted dark:text-dark-text-secondary border-b border-border dark:border-dark-border">
                  <th className="py-1.5 pr-2 font-medium">{t('Mes')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('Programado')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('Cobrado')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('Pendiente')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('Vencido')}</th>
                  <th className="py-1.5 pl-2 font-medium text-right">{t('Cuotas')}</th>
                  <th className="py-1.5 pl-2 font-medium text-right">{t('Clientes')}</th>
                </tr>
              </thead>
              <tbody>
                {proyeccion.map((m) => (
                  <tr key={m.mes} className="border-b border-border/60 dark:border-dark-border/60 last:border-0">
                    <td className="py-1.5 pr-2">{etiquetaMesCorta(m.mes, t)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{simboloMoneda(monedaProyeccion)}{formatearMonto(m.programado)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-good">{simboloMoneda(monedaProyeccion)}{formatearMonto(m.cobrado)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{simboloMoneda(monedaProyeccion)}{formatearMonto(m.pendiente)}</td>
                    <td className={`py-1.5 px-2 text-right tabular-nums ${m.vencido > 0 ? 'text-bad' : ''}`}>{simboloMoneda(monedaProyeccion)}{formatearMonto(m.vencido)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{m.cantidadCuotas}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{m.cantidadClientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QCard>
      )}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {hayFiltro && filasRaw.length > 0 ? t('Ningún cliente que deba entra en los filtros elegidos.') : t('Nadie te debe nada por cuenta corriente.')}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-muted dark:text-dark-text-secondary">{t('Ordenar por:')}</span>
            {(['vencimiento', 'saldo', 'vencido', 'nombre'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOrden(o)}
                className={`rounded-lg px-2.5 py-1 font-medium ${
                  orden === o ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border'
                }`}
              >
                {o === 'vencimiento' ? t('Próximo vencimiento') : o === 'saldo' ? t('Deuda') : o === 'vencido' ? t('Vencido') : t('Nombre')}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {ordenadas.map((f) => {
              const estado = estadoCuenta(f.saldo, f.vencido, f.suspendido);
              const info = ESTADO_INFO[estado];
              const prox = proximoVencPorCliente.get(f.id);
              const fechaProx = prox ? new Date(prox.fecha + 'T00:00:00').toLocaleDateString('es-AR') : null;
              const linkWhatsApp = f.telefono
                ? armarLinkWhatsApp(f.telefono, mensajeRecordatorioCobranza(f.nombre, fmt(prox?.monto ?? f.saldo), fechaProx, t), codigoPais)
                : null;
              return (
                <div
                  key={f.id}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <Link href={`/clientes/${f.id}`} className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {f.nombre}
                      {f.localidad ? <span className="text-xs font-normal text-muted dark:text-dark-text-secondary"> · 📍 {f.localidad}</span> : null}
                    </p>
                    {(idsYaCobroNoPago.has(f.id) || infoClientes.get(f.id)?.calificacion) && (
                      <span className="inline-flex flex-wrap items-center gap-1 mt-0.5">
                        {idsYaCobroNoPago.has(f.id) && <EtiquetaYaCobro />}
                        <EtiquetaCalidad calificacion={infoClientes.get(f.id)?.calificacion} />
                      </span>
                    )}
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${info.fondo}`}>
                      {info.label}
                      {f.vencido > 0 ? ` · ${t('vencido')} ${fmt(f.vencido)}` : ''}
                    </span>
                    {prox && (
                      <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-0.5">
                        {t('Vence el')} {fechaProx} · {prox.numero != null ? `${t('Cuota')} ${prox.numero}/${prox.total} · ` : ''}
                        {fmt(prox.monto)}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <p className="text-sm font-semibold text-warn">{fmt(f.saldo)}</p>
                    {linkWhatsApp && (
                      <a
                        href={linkWhatsApp}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('Enviar recordatorio por WhatsApp')}
                        className="rounded-lg border border-good/30 text-good px-2 py-1.5 hover:bg-good/10"
                      >
                        💬
                      </a>
                    )}
                    <Link
                      href={`/clientes/${f.id}?abrirPago=1`}
                      title={t('Registrar un pago')}
                      className="rounded-lg border border-accent/30 dark:border-dark-accent/30 text-accent dark:text-dark-accent px-2 py-1.5 hover:bg-accent-soft dark:hover:bg-dark-accent-soft"
                    >
                      💰
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function ResumenMes({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div>
      <p className={`text-sm font-display font-semibold leading-none ${tono ?? ''}`}>{valor}</p>
      <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">{etiqueta}</p>
    </div>
  );
}

// 'YYYY-MM' -> "ago" (mes corto en español, sin depender de que el navegador
// tenga el locale 'es' cargado igual en todos lados: se arma a mano).
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function etiquetaMesCorta(mesISO: string, t: (texto: string) => string): string {
  const [anio, mes] = mesISO.split('-').map(Number);
  return `${t(MESES_CORTOS[mes - 1])} ${String(anio).slice(2)}`;
}
