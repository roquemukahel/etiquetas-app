'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { obtenerTodasLasFilas } from '../../lib/db';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import { formatearMonto } from '../../lib/numeros';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';
import { RankingBarras, EvolucionBarras } from '../../estadisticas/graficos';
import { StatCard, SeccionCard, EmptyState, SegmentedChips } from '../../estadisticas/ui';
import {
  PERIODOS_METRICAS,
  PeriodoMetricas,
  rangoMetricas,
  diasEvolucionPara,
  calcularKpis,
  serviciosFrecuentes,
  modelosFrecuentes,
  repuestosMasUsados,
  embudoEstados,
  serieIngresadas,
  ordenesAbiertasPorAntiguedad,
  cargaPorTecnico,
  repuestosBajaRotacion,
  repuestosStockCritico,
  ReparacionMetrica,
  RepuestoUsoMetrica,
  RepuestoMetrica,
} from '../metricasDatos';
import { useT } from '../../lib/idioma';
import { useSucursalActual } from '../../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';

type Tecnico = { id: string; nombre: string };

export default function MetricasServicioTecnico() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  // Costos, márgenes y comparativas entre técnicos son información sensible
  // del negocio — mismo permiso que ya restringe esas mismas cifras en
  // Técnicos (Fase 3) y en el panel lateral de la ficha (Fase 6), en vez de
  // crear uno nuevo solo para esta pantalla.
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');
  const sucursalActual = useSucursalActual();

  const [reparaciones, setReparaciones] = useState<ReparacionMetrica[]>([]);
  const [usosRepuestos, setUsosRepuestos] = useState<RepuestoUsoMetrica[]>([]);
  const [repuestos, setRepuestos] = useState<RepuestoMetrica[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoMetricas>('30d');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
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
    if (!puedeVerEstadisticas) {
      setLoading(false);
      return;
    }
    (async () => {
      const [reps, usos, { data: rep }, { data: tecs }] = await Promise.all([
        obtenerTodasLasFilas<ReparacionMetrica>(
          supabase,
          'reparaciones',
          'id, modelo, estado, tecnico_id, fecha_ingreso_servicio, fecha_reparado, fecha_entrega, fecha_estimada, estado_actualizado_at, importe_total, presupuesto_estado, presupuesto_respondido_at, tipo_ingreso, trabajos_realizados, sucursal_id'
        ),
        obtenerTodasLasFilas<RepuestoUsoMetrica>(supabase, 'reparaciones_repuestos', 'reparacion_id, nombre_repuesto, cantidad, costo_unitario'),
        supabase.from('repuestos').select('id, nombre, cantidad_stock, cantidad_reservada, stock_minimo'),
        supabase.from('tecnicos').select('id, nombre').order('nombre'),
      ]);
      setReparaciones(reps);
      setUsosRepuestos(usos);
      setRepuestos((rep as RepuestoMetrica[]) ?? []);
      setTecnicos((tecs as Tecnico[]) ?? []);
      setLoading(false);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      const codigo = (perfil as any)?.negocios?.moneda;
      if (codigo) setMoneda(simboloMoneda(codigo));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerEstadisticas]);

  const nombreTecnico = (id: string) => tecnicos.find((tec) => tec.id === id)?.nombre ?? t('Sin técnico');

  const reparacionesSucursal = useMemo(
    () => reparaciones.filter((r) => !filtroSucursal || r.sucursal_id === filtroSucursal),
    [reparaciones, filtroSucursal]
  );
  const reparacionesFiltradas = useMemo(
    () => (filtroTecnico ? reparacionesSucursal.filter((r) => r.tecnico_id === filtroTecnico) : reparacionesSucursal),
    [reparacionesSucursal, filtroTecnico]
  );

  const { desde, hasta } = useMemo(() => rangoMetricas(periodo, new Date()), [periodo]);
  const kpis = useMemo(() => calcularKpis(reparacionesFiltradas, usosRepuestos, desde, hasta), [reparacionesFiltradas, usosRepuestos, desde, hasta]);
  const evolucion = useMemo(() => serieIngresadas(reparacionesFiltradas, hasta, diasEvolucionPara(periodo)), [reparacionesFiltradas, hasta, periodo]);
  const embudo = useMemo(() => embudoEstados(reparacionesFiltradas), [reparacionesFiltradas]);
  const servicios = useMemo(() => serviciosFrecuentes(reparacionesFiltradas, desde, hasta), [reparacionesFiltradas, desde, hasta]);
  const modelos = useMemo(() => modelosFrecuentes(reparacionesFiltradas, desde, hasta), [reparacionesFiltradas, desde, hasta]);
  const repuestosUsados = useMemo(
    () => repuestosMasUsados(usosRepuestos, reparacionesFiltradas, desde, hasta),
    [usosRepuestos, reparacionesFiltradas, desde, hasta]
  );
  const antiguedad = useMemo(() => ordenesAbiertasPorAntiguedad(reparacionesFiltradas, hasta), [reparacionesFiltradas, hasta]);
  const carga = useMemo(() => cargaPorTecnico(reparacionesSucursal, nombreTecnico), [reparacionesSucursal, tecnicos]);
  const bajaRotacion = useMemo(
    () => repuestosBajaRotacion(repuestos, usosRepuestos, reparaciones, desde, hasta),
    [repuestos, usosRepuestos, reparaciones, desde, hasta]
  );
  const stockCritico = useMemo(() => repuestosStockCritico(repuestos), [repuestos]);

  if (!puedeVerEstadisticas) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/servicio-tecnico" aria-label={t('Volver')} className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">{t('Métricas')}</span>
        </header>
        <ServicioTecnicoTabs active="metricas" />
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {t('No tenés permiso para ver las métricas de Servicio Técnico.')}
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  const fmt = (n: number) => `${moneda}${formatearMonto(n)}`;
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1).replace('.', ',')}%`);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/servicio-tecnico" aria-label={t('Volver')} className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-medium leading-tight">{t('Métricas')}</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Rendimiento real del taller — nada estimado, todo sale de datos cargados')}</p>
        </div>
        <Link href="/estadisticas" className="text-xs text-accent dark:text-dark-accent underline shrink-0 self-center">
          {t('Estadísticas generales')} →
        </Link>
      </header>

      <ServicioTecnicoTabs active="metricas" />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedChips valor={periodo} opciones={PERIODOS_METRICAS.map((p) => ({ key: p.id, label: t(p.label) }))} onChange={setPeriodo} size="sm" />
        {tecnicos.length > 0 && (
          <select
            value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}
            aria-label={t('Filtrar por técnico')}
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">{t('Todos los técnicos')}</option>
            {tecnicos.map((tec) => (
              <option key={tec.id} value={tec.id}>
                {tec.nombre}
              </option>
            ))}
          </select>
        )}
        {sucursales.length > 1 && (
          <select
            value={filtroSucursal}
            onChange={(e) => setFiltroSucursal(e.target.value)}
            aria-label={t('Filtrar por sucursal')}
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">🏬 {t('Todas las sucursales')}</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                🏬 {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard etiqueta={t('Ingresadas')} valor={kpis.ingresadas.toLocaleString('es-AR')} tooltip={t('Equipos que entraron en el período elegido.')} />
        <StatCard etiqueta={t('Terminadas')} valor={kpis.terminadas.toLocaleString('es-AR')} tooltip={t('Reparaciones entregadas en el período.')} tono="text-good" />
        <StatCard etiqueta={t('Activas ahora')} valor={kpis.activas.toLocaleString('es-AR')} tooltip={t('Todas las que no están entregadas ni canceladas, sin importar el período.')} />
        <StatCard
          etiqueta={t('Demoradas')}
          valor={kpis.demoradas.toLocaleString('es-AR')}
          tooltip={t('Activas con más de 5 días desde el ingreso o con la fecha prometida vencida.')}
          tono={kpis.demoradas > 0 ? 'text-bad' : undefined}
        />
        <StatCard
          etiqueta={t('Permanencia promedio')}
          valor={kpis.tiempoPermanenciaPromedioDias != null ? `${kpis.tiempoPermanenciaPromedioDias.toFixed(1).replace('.', ',')}d` : '—'}
          tooltip={t('Días entre el ingreso y quedar reparado, promedio de las terminadas en el período.')}
        />
        <StatCard etiqueta={t('Esperando aprobación')} valor={pct(kpis.pctEsperandoAprobacion)} tooltip={t('Porcentaje de las activas esperando que el cliente apruebe el presupuesto.')} />
        <StatCard etiqueta={t('Esperando repuesto')} valor={pct(kpis.pctEsperandoRepuesto)} tooltip={t('Porcentaje de las activas frenadas por falta de un repuesto.')} />
        <StatCard
          etiqueta={t('Tasa de aprobación')}
          valor={pct(kpis.tasaAprobacionPresupuestos)}
          tooltip={t('De los presupuestos respondidos en el período (aprobados o rechazados), qué porcentaje se aprobó.')}
        />
        <StatCard etiqueta={t('Tasa de solución')} valor={pct(kpis.tasaSolucion)} tooltip={t('De lo que se cerró en el período (entregado o cancelado), qué porcentaje terminó entregado.')} />
        <StatCard
          etiqueta={t('Reincidencia')}
          valor={pct(kpis.tasaReincidencia)}
          tooltip={t('Porcentaje de los ingresos del período clasificados como retrabajo o reincidencia no cubierta.')}
          tono={kpis.tasaReincidencia != null && kpis.tasaReincidencia > 0 ? 'text-warn' : undefined}
        />
        <StatCard etiqueta={t('Garantías')} valor={kpis.garantias.toLocaleString('es-AR')} tooltip={t('Ingresos del período clasificados como garantía.')} />
        <StatCard etiqueta={t('Retrabajos')} valor={kpis.retrabajos.toLocaleString('es-AR')} tooltip={t('Ingresos del período clasificados como retrabajo.')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard etiqueta={t('Facturación')} valor={fmt(kpis.facturacion)} tooltip={t('Importe total de las reparaciones entregadas en el período.')} />
        <StatCard etiqueta={t('Costo de repuestos')} valor={fmt(kpis.costoRepuestos)} tooltip={t('Costo histórico (congelado al momento de usarlo) de los repuestos de esas reparaciones.')} />
        <StatCard etiqueta={t('Ganancia bruta')} valor={fmt(kpis.gananciaBruta)} tono={kpis.gananciaBruta >= 0 ? 'text-good' : 'text-bad'} tooltip={t('Facturación menos costo de repuestos.')} />
        <StatCard etiqueta={t('Margen')} valor={pct(kpis.margenPct)} tono={kpis.margenPct != null && kpis.margenPct >= 0 ? 'text-good' : 'text-bad'} />
      </div>

      <SeccionCard titulo={t('Reparaciones ingresadas por día')} subtitulo={`${t('Últimos')} ${diasEvolucionPara(periodo)} ${t('días.')}`}>
        <EvolucionBarras datos={evolucion} moneda="" />
      </SeccionCard>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo={t('Reparaciones activas por estado')} subtitulo={t('Embudo del taller ahora mismo.')}>
          {embudo.every((e) => e.valor === 0) ? <EmptyState titulo={t('No hay reparaciones activas')} /> : <EvolucionBarras datos={embudo.map((e) => ({ label: t(e.nombre), valor: e.valor }))} moneda="" />}
        </SeccionCard>
        <SeccionCard titulo={t('Antigüedad de las órdenes abiertas')} subtitulo={t('Las más viejas primero.')}>
          {antiguedad.length === 0 ? (
            <EmptyState titulo={t('No hay órdenes abiertas')} />
          ) : (
            <RankingBarras datos={antiguedad.map((a) => ({ nombre: a.label, valor: a.dias }))} sufijo={` ${t('días')}`} />
          )}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo={t('Servicios más solicitados')} subtitulo={t('Según los trabajos realizados del período.')}>
          {servicios.length === 0 ? <EmptyState titulo={t('Sin servicios registrados en el período')} /> : <RankingBarras datos={servicios.map((s) => ({ nombre: s.nombre, valor: s.valor }))} sufijo={` ${t('vez(veces)')}`} />}
        </SeccionCard>
        <SeccionCard titulo={t('Modelos más reparados')}>
          {modelos.length === 0 ? <EmptyState titulo={t('Sin ingresos en el período')} /> : <RankingBarras datos={modelos.map((m) => ({ nombre: m.nombre, valor: m.valor }))} />}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo={t('Repuestos más utilizados')}>
          {repuestosUsados.length === 0 ? <EmptyState titulo={t('Sin repuestos usados en el período')} /> : <RankingBarras datos={repuestosUsados.map((r) => ({ nombre: r.nombre, valor: r.valor }))} sufijo={` ${t('unid.')}`} />}
        </SeccionCard>
        <SeccionCard titulo={t('Carga por técnico')} subtitulo={t('Reparaciones activas asignadas ahora mismo (todos los períodos).')}>
          {carga.length === 0 ? <EmptyState titulo={t('Sin reparaciones activas asignadas')} /> : <RankingBarras datos={carga.map((c) => ({ nombre: c.nombre, valor: c.valor }))} />}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo={t('Stock crítico')} subtitulo={t('Repuestos en o por debajo del mínimo configurado.')}>
          {stockCritico.length === 0 ? (
            <EmptyState titulo={t('Sin repuestos en stock crítico')} />
          ) : (
            <RankingBarras datos={stockCritico.map((s) => ({ nombre: s.nombre, valor: s.valor }))} sufijo={` ${t('disp.')}`} />
          )}
        </SeccionCard>
        <SeccionCard titulo={t('Repuestos con baja rotación')} subtitulo={t('Con stock cargado pero sin uso en el período elegido.')}>
          {bajaRotacion.length === 0 ? (
            <EmptyState titulo={t('Todo el stock tuvo movimiento en el período')} />
          ) : (
            <RankingBarras datos={bajaRotacion.map((r) => ({ nombre: r.nombre, valor: r.valor }))} sufijo={` ${t('en stock')}`} />
          )}
        </SeccionCard>
      </div>
    </main>
  );
}
