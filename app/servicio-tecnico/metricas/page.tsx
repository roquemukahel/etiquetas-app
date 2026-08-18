'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
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

type Tecnico = { id: string; nombre: string };

export default function MetricasServicioTecnico() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  // Costos, márgenes y comparativas entre técnicos son información sensible
  // del negocio — mismo permiso que ya restringe esas mismas cifras en
  // Técnicos (Fase 3) y en el panel lateral de la ficha (Fase 6), en vez de
  // crear uno nuevo solo para esta pantalla.
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');

  const [reparaciones, setReparaciones] = useState<ReparacionMetrica[]>([]);
  const [usosRepuestos, setUsosRepuestos] = useState<RepuestoUsoMetrica[]>([]);
  const [repuestos, setRepuestos] = useState<RepuestoMetrica[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoMetricas>('30d');
  const [filtroTecnico, setFiltroTecnico] = useState('');

  useEffect(() => {
    if (!puedeVerEstadisticas) {
      setLoading(false);
      return;
    }
    (async () => {
      const [{ data: reps }, { data: usos }, { data: rep }, { data: tecs }] = await Promise.all([
        supabase
          .from('reparaciones')
          .select(
            'id, modelo, estado, tecnico_id, fecha_ingreso_servicio, fecha_reparado, fecha_entrega, fecha_estimada, estado_actualizado_at, importe_total, presupuesto_estado, presupuesto_respondido_at, tipo_ingreso, trabajos_realizados'
          ),
        supabase.from('reparaciones_repuestos').select('reparacion_id, nombre_repuesto, cantidad, costo_unitario'),
        supabase.from('repuestos').select('id, nombre, cantidad_stock, cantidad_reservada, stock_minimo'),
        supabase.from('tecnicos').select('id, nombre').order('nombre'),
      ]);
      setReparaciones((reps as ReparacionMetrica[]) ?? []);
      setUsosRepuestos((usos as RepuestoUsoMetrica[]) ?? []);
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

  const nombreTecnico = (id: string) => tecnicos.find((t) => t.id === id)?.nombre ?? 'Sin técnico';

  const reparacionesFiltradas = useMemo(
    () => (filtroTecnico ? reparaciones.filter((r) => r.tecnico_id === filtroTecnico) : reparaciones),
    [reparaciones, filtroTecnico]
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
  const carga = useMemo(() => cargaPorTecnico(reparaciones, nombreTecnico), [reparaciones, tecnicos]);
  const bajaRotacion = useMemo(
    () => repuestosBajaRotacion(repuestos, usosRepuestos, reparaciones, desde, hasta),
    [repuestos, usosRepuestos, reparaciones, desde, hasta]
  );
  const stockCritico = useMemo(() => repuestosStockCritico(repuestos), [repuestos]);

  if (!puedeVerEstadisticas) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/servicio-tecnico" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">Métricas</span>
        </header>
        <ServicioTecnicoTabs active="metricas" />
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          No tenés permiso para ver las métricas de Servicio Técnico.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  const fmt = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1).replace('.', ',')}%`);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-medium leading-tight">Métricas</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">Rendimiento real del taller — nada estimado, todo sale de datos cargados</p>
        </div>
      </header>

      <ServicioTecnicoTabs active="metricas" />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedChips valor={periodo} opciones={PERIODOS_METRICAS.map((p) => ({ key: p.id, label: p.label }))} onChange={setPeriodo} size="sm" />
        {tecnicos.length > 0 && (
          <select
            value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}
            aria-label="Filtrar por técnico"
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard etiqueta="Ingresadas" valor={kpis.ingresadas.toLocaleString('es-AR')} tooltip="Equipos que entraron en el período elegido." />
        <StatCard etiqueta="Terminadas" valor={kpis.terminadas.toLocaleString('es-AR')} tooltip="Reparaciones entregadas en el período." tono="text-good" />
        <StatCard etiqueta="Activas ahora" valor={kpis.activas.toLocaleString('es-AR')} tooltip="Todas las que no están entregadas ni canceladas, sin importar el período." />
        <StatCard
          etiqueta="Demoradas"
          valor={kpis.demoradas.toLocaleString('es-AR')}
          tooltip="Activas con más de 5 días desde el ingreso o con la fecha prometida vencida."
          tono={kpis.demoradas > 0 ? 'text-bad' : undefined}
        />
        <StatCard
          etiqueta="Permanencia promedio"
          valor={kpis.tiempoPermanenciaPromedioDias != null ? `${kpis.tiempoPermanenciaPromedioDias.toFixed(1).replace('.', ',')}d` : '—'}
          tooltip="Días entre el ingreso y quedar reparado, promedio de las terminadas en el período."
        />
        <StatCard etiqueta="Esperando aprobación" valor={pct(kpis.pctEsperandoAprobacion)} tooltip="Porcentaje de las activas esperando que el cliente apruebe el presupuesto." />
        <StatCard etiqueta="Esperando repuesto" valor={pct(kpis.pctEsperandoRepuesto)} tooltip="Porcentaje de las activas frenadas por falta de un repuesto." />
        <StatCard
          etiqueta="Tasa de aprobación"
          valor={pct(kpis.tasaAprobacionPresupuestos)}
          tooltip="De los presupuestos respondidos en el período (aprobados o rechazados), qué porcentaje se aprobó."
        />
        <StatCard etiqueta="Tasa de solución" valor={pct(kpis.tasaSolucion)} tooltip="De lo que se cerró en el período (entregado o cancelado), qué porcentaje terminó entregado." />
        <StatCard
          etiqueta="Reincidencia"
          valor={pct(kpis.tasaReincidencia)}
          tooltip="Porcentaje de los ingresos del período clasificados como retrabajo o reincidencia no cubierta."
          tono={kpis.tasaReincidencia != null && kpis.tasaReincidencia > 0 ? 'text-warn' : undefined}
        />
        <StatCard etiqueta="Garantías" valor={kpis.garantias.toLocaleString('es-AR')} tooltip="Ingresos del período clasificados como garantía." />
        <StatCard etiqueta="Retrabajos" valor={kpis.retrabajos.toLocaleString('es-AR')} tooltip="Ingresos del período clasificados como retrabajo." />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard etiqueta="Facturación" valor={fmt(kpis.facturacion)} tooltip="Importe total de las reparaciones entregadas en el período." />
        <StatCard etiqueta="Costo de repuestos" valor={fmt(kpis.costoRepuestos)} tooltip="Costo histórico (congelado al momento de usarlo) de los repuestos de esas reparaciones." />
        <StatCard etiqueta="Ganancia bruta" valor={fmt(kpis.gananciaBruta)} tono={kpis.gananciaBruta >= 0 ? 'text-good' : 'text-bad'} tooltip="Facturación menos costo de repuestos." />
        <StatCard etiqueta="Margen" valor={pct(kpis.margenPct)} tono={kpis.margenPct != null && kpis.margenPct >= 0 ? 'text-good' : 'text-bad'} />
      </div>

      <SeccionCard titulo="Reparaciones ingresadas por día" subtitulo={`Últimos ${diasEvolucionPara(periodo)} días.`}>
        <EvolucionBarras datos={evolucion} moneda="" />
      </SeccionCard>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo="Reparaciones activas por estado" subtitulo="Embudo del taller ahora mismo.">
          {embudo.every((e) => e.valor === 0) ? <EmptyState titulo="No hay reparaciones activas" /> : <EvolucionBarras datos={embudo.map((e) => ({ label: e.nombre, valor: e.valor }))} moneda="" />}
        </SeccionCard>
        <SeccionCard titulo="Antigüedad de las órdenes abiertas" subtitulo="Las más viejas primero.">
          {antiguedad.length === 0 ? (
            <EmptyState titulo="No hay órdenes abiertas" />
          ) : (
            <RankingBarras datos={antiguedad.map((a) => ({ nombre: a.label, valor: a.dias }))} sufijo=" días" />
          )}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo="Servicios más solicitados" subtitulo="Según los trabajos realizados del período.">
          {servicios.length === 0 ? <EmptyState titulo="Sin servicios registrados en el período" /> : <RankingBarras datos={servicios.map((s) => ({ nombre: s.nombre, valor: s.valor }))} sufijo=" vez(veces)" />}
        </SeccionCard>
        <SeccionCard titulo="Modelos más reparados">
          {modelos.length === 0 ? <EmptyState titulo="Sin ingresos en el período" /> : <RankingBarras datos={modelos.map((m) => ({ nombre: m.nombre, valor: m.valor }))} />}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo="Repuestos más utilizados">
          {repuestosUsados.length === 0 ? <EmptyState titulo="Sin repuestos usados en el período" /> : <RankingBarras datos={repuestosUsados.map((r) => ({ nombre: r.nombre, valor: r.valor }))} sufijo=" unid." />}
        </SeccionCard>
        <SeccionCard titulo="Carga por técnico" subtitulo="Reparaciones activas asignadas ahora mismo (todos los períodos).">
          {carga.length === 0 ? <EmptyState titulo="Sin reparaciones activas asignadas" /> : <RankingBarras datos={carga.map((c) => ({ nombre: c.nombre, valor: c.valor }))} />}
        </SeccionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SeccionCard titulo="Stock crítico" subtitulo="Repuestos en o por debajo del mínimo configurado.">
          {stockCritico.length === 0 ? (
            <EmptyState icono="✅" titulo="Sin repuestos en stock crítico" />
          ) : (
            <RankingBarras datos={stockCritico.map((s) => ({ nombre: s.nombre, valor: s.valor }))} sufijo=" disp." />
          )}
        </SeccionCard>
        <SeccionCard titulo="Repuestos con baja rotación" subtitulo="Con stock cargado pero sin uso en el período elegido.">
          {bajaRotacion.length === 0 ? (
            <EmptyState titulo="Todo el stock tuvo movimiento en el período" />
          ) : (
            <RankingBarras datos={bajaRotacion.map((r) => ({ nombre: r.nombre, valor: r.valor }))} sufijo=" en stock" />
          )}
        </SeccionCard>
      </div>
    </main>
  );
}
