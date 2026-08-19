'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, CreditCard, FileWarning, PackageOpen, ChevronRight } from 'lucide-react';
import { crearClienteNavegador } from '../lib/supabase/client';
import { StatCard, SeccionCard, EmptyState, Skeleton, PeriodoSelector, MetricaNoDisponible, rangoDePeriodo, Periodo } from './_ui';
import { BarrasHorizontales, BarrasVerticales, Embudo } from './_charts';

type Metricas = {
  negocios_registrados_total: number;
  negocios_activos: number;
  suscripciones_pagas_activas: number;
  negocios_en_prueba: number;
  nuevos_registros_periodo: number;
  nuevos_registros_periodo_anterior: number;
  pruebas_por_vencer_3d: number;
  pruebas_por_vencer_7d: number;
  pruebas_por_vencer_14d: number;
  pago_pendiente: number;
  comprobantes_pendientes: number;
  suspendidos_manual: number;
  cancelados_o_expirados: number;
  ingresos_periodo_por_moneda: Record<string, number>;
  negocios_activos_7d: number;
  negocios_activos_30d: number;
  negocios_sin_configurar: number;
};

type Alerta = { tipo: string; severidad: string; negocio_id: string; negocio_nombre: string; detalle: string };

const ICONO_ALERTA: Record<string, any> = {
  prueba_por_vencer: Clock,
  pago_pendiente: CreditCard,
  comprobante_pendiente: FileWarning,
  sin_actividad: AlertTriangle,
  sin_configurar: PackageOpen,
};

function pctVariacion(actual: number, anterior: number): { pct: number | null; abs: number } {
  if (anterior === 0) return { pct: null, abs: actual };
  return { pct: ((actual - anterior) / anterior) * 100, abs: actual - anterior };
}

export default function AdminResumen() {
  const supabase = crearClienteNavegador();
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [desdePersonalizado, setDesdePersonalizado] = useState('');
  const [hastaPersonalizado, setHastaPersonalizado] = useState('');

  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [evolucion, setEvolucion] = useState<{ dia: string; cantidad: number }[]>([]);
  const [distribucionPlanes, setDistribucionPlanes] = useState<{ plan: string; cantidad: number }[]>([]);
  const [usoPorModulo, setUsoPorModulo] = useState<Record<string, number> | null>(null);
  const [embudo, setEmbudo] = useState<Record<string, number> | null>(null);
  const [cargando, setCargando] = useState(true);

  const rango = useMemo(() => rangoDePeriodo(periodo, desdePersonalizado, hastaPersonalizado), [periodo, desdePersonalizado, hastaPersonalizado]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    (async () => {
      const desdeIso = rango.desde.toISOString();
      const hastaIso = rango.hasta.toISOString();
      const [
        { data: m, error: errM },
        { data: ev, error: errEv },
        { data: uso, error: errUso },
      ] = await Promise.all([
        supabase.rpc('admin_resumen_metricas', { p_desde: desdeIso, p_hasta: hastaIso }),
        supabase.rpc('admin_evolucion_registros', { p_desde: desdeIso, p_hasta: hastaIso }),
        supabase.rpc('admin_uso_por_modulo', { p_desde: desdeIso, p_hasta: hastaIso }),
      ]);
      if (cancelado) return;
      if (errM || errEv || errUso) console.error('admin resumen:', errM ?? errEv ?? errUso);
      setMetricas((m as Metricas) ?? null);
      setEvolucion((ev as { dia: string; cantidad: number }[]) ?? []);
      setUsoPorModulo((uso as Record<string, number>) ?? null);
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde.getTime(), rango.hasta.getTime()]);

  useEffect(() => {
    (async () => {
      const [
        { data: al, error: errAl },
        { data: dp, error: errDp },
        { data: emb, error: errEmb },
      ] = await Promise.all([
        supabase.rpc('admin_alertas'),
        supabase.rpc('admin_distribucion_planes'),
        supabase.rpc('admin_embudo'),
      ]);
      if (errAl || errDp || errEmb) console.error('admin resumen (alertas/planes/embudo):', errAl ?? errDp ?? errEmb);
      setAlertas((al as Alerta[]) ?? []);
      setDistribucionPlanes((dp as { plan: string; cantidad: number }[]) ?? []);
      setEmbudo((emb as Record<string, number>) ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const variacionRegistros = metricas ? pctVariacion(metricas.nuevos_registros_periodo, metricas.nuevos_registros_periodo_anterior) : null;
  const alertasTop = alertas.slice(0, 6);

  const ingresosTexto = metricas
    ? Object.entries(metricas.ingresos_periodo_por_moneda ?? {})
        .map(([moneda, monto]) => `${moneda} ${Number(monto).toLocaleString('es-AR')}`)
        .join(' · ') || '0'
    : '';

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold">Resumen</h1>
          <p className="text-sm text-dark-text-secondary">El estado comercial y de uso de Qovento, de un vistazo.</p>
        </div>
        <PeriodoSelector
          valor={periodo}
          onChange={setPeriodo}
          desdePersonalizado={desdePersonalizado}
          hastaPersonalizado={hastaPersonalizado}
          onCambiarPersonalizado={(d, h) => {
            setDesdePersonalizado(d);
            setHastaPersonalizado(h);
          }}
        />
      </header>

      {/* Centro de alertas */}
      <SeccionCard
        titulo="Alertas"
        subtitulo="Lo que necesita atención ahora"
        accion={
          alertas.length > 6 && (
            <span className="text-xs text-dark-text-secondary">+{alertas.length - 6} más</span>
          )
        }
      >
        {alertasTop.length === 0 ? (
          <EmptyState titulo="Sin alertas activas" texto="Ningún negocio necesita atención en este momento." icono="✓" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {alertasTop.map((a, i) => {
              const Icono = ICONO_ALERTA[a.tipo] ?? AlertTriangle;
              const color = a.severidad === 'alta' ? 'text-bad' : a.severidad === 'media' ? 'text-warn' : 'text-dark-text-secondary';
              return (
                <Link
                  key={`${a.tipo}-${a.negocio_id}-${i}`}
                  href={`/admin/negocios/${a.negocio_id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-dark-bg transition-colors"
                >
                  <Icono className={`h-4 w-4 shrink-0 ${color}`} />
                  <span className="flex-1 min-w-0 text-sm truncate">
                    <span className="font-medium">{a.negocio_nombre}</span>
                    <span className="text-dark-text-secondary"> — {a.detalle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-dark-text-secondary" />
                </Link>
              );
            })}
          </div>
        )}
      </SeccionCard>

      {/* Métricas de utilización */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-dark-text-secondary mb-2">Negocios y utilización</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cargando || !metricas ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard etiqueta="Negocios registrados" valor={String(metricas.negocios_registrados_total)} tooltip="Total histórico de negocios creados." />
              <StatCard etiqueta="Con acceso activo" valor={String(metricas.negocios_activos)} tooltip="Negocios con el acceso encendido (no suspendidos a mano)." />
              <StatCard etiqueta="Suscripciones pagas activas" valor={String(metricas.suscripciones_pagas_activas)} tooltip="estado_suscripcion = active." />
              <StatCard etiqueta="En período de prueba" valor={String(metricas.negocios_en_prueba)} tooltip="Negocios que todavía no pagaron, dentro de su prueba gratuita." />
              <StatCard
                etiqueta="Nuevos registros"
                valor={String(metricas.nuevos_registros_periodo)}
                variacion={variacionRegistros ?? undefined}
                tooltip="Negocios creados dentro del período elegido, comparado con un período anterior de igual duración."
              />
              <StatCard etiqueta="Activos (7 días)" valor={String(metricas.negocios_activos_7d)} tooltip="Negocios con al menos una venta o alta de stock en los últimos 7 días." />
              <StatCard etiqueta="Activos (30 días)" valor={String(metricas.negocios_activos_30d)} tooltip="Negocios con al menos una venta o alta de stock en los últimos 30 días." />
              <StatCard etiqueta="Sin configurar" valor={String(metricas.negocios_sin_configurar)} tooltip="Se registraron pero todavía no cargaron ni un dispositivo ni un cliente." tono="text-warn" />
            </>
          )}
        </div>
      </div>

      {/* Métricas comerciales */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-dark-text-secondary mb-2">Comercial y facturación</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cargando || !metricas ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard etiqueta="Ingresos cobrados (período)" valor={ingresosTexto} tooltip="Suma de comprobantes de pago manual aprobados en el período. No incluye pagos con tarjeta vía Lemon Squeezy: ese proveedor todavía no informa el monto exacto de cada cobro." />
              <StatCard etiqueta="Pago pendiente" valor={String(metricas.pago_pendiente)} tono="text-warn" tooltip="Negocios en past_due o unpaid según su proveedor de pago." />
              <StatCard etiqueta="Comprobantes por revisar" valor={String(metricas.comprobantes_pendientes)} tono="text-warn" tooltip="Pagos manuales (USDT/transferencia) esperando aprobación." />
              <StatCard etiqueta="Suspendidos / cancelados" valor={String(metricas.suspendidos_manual + metricas.cancelados_o_expirados)} tono="text-bad" tooltip="Suma de suspendidos a mano y cancelados/expirados/pausados por el proveedor de pago." />
              <MetricaNoDisponible
                etiqueta="MRR de Qovento"
                tooltip="Requiere que el webhook de Lemon Squeezy guarde el precio real de cada suscripción — hoy solo guarda su estado. Instrumentación pendiente (fase 2)."
              />
              <MetricaNoDisponible
                etiqueta="ARR estimado"
                tooltip="Depende del MRR real, que todavía no es calculable (ver arriba)."
              />
              <MetricaNoDisponible
                etiqueta="Conversión prueba → pago"
                tooltip="Requiere un historial de cuándo cada negocio pasó de prueba a pago. Hoy solo se ve el estado actual, no cuándo cambió — instrumentación pendiente (fase 2)."
              />
              <MetricaNoDisponible
                etiqueta="Cancelaciones del período"
                tooltip="Mismo motivo que la conversión: no hay un registro de CUÁNDO se canceló cada suscripción, solo el estado actual."
              />
            </>
          )}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SeccionCard titulo="Nuevos negocios" subtitulo="Registros por día en el período elegido">
          {cargando ? <Skeleton className="h-32" /> : <BarrasVerticales datos={evolucion.map((e) => ({ etiqueta: e.dia.slice(5), valor: Number(e.cantidad) }))} />}
        </SeccionCard>

        <SeccionCard titulo="Distribución por plan" subtitulo="Negocios con suscripción paga activa">
          {distribucionPlanes.length === 0 ? (
            <Skeleton className="h-32" />
          ) : (
            <BarrasHorizontales datos={distribucionPlanes.map((d) => ({ etiqueta: d.plan === 'sin_plan' ? 'Sin plan asignado' : d.plan, valor: Number(d.cantidad) }))} />
          )}
        </SeccionCard>

        <SeccionCard titulo="Uso del producto por módulo" subtitulo="Elementos creados por todos los negocios en el período">
          {cargando || !usoPorModulo ? (
            <Skeleton className="h-32" />
          ) : (
            <BarrasHorizontales
              datos={[
                { etiqueta: 'Ventas', valor: usoPorModulo.ventas ?? 0 },
                { etiqueta: 'Stock', valor: usoPorModulo.stock ?? 0 },
                { etiqueta: 'Reparaciones', valor: usoPorModulo.reparaciones ?? 0 },
                { etiqueta: 'Clientes', valor: usoPorModulo.clientes ?? 0 },
              ]}
            />
          )}
        </SeccionCard>

        <SeccionCard titulo="Embudo" subtitulo="Registro → prueba → pago (estado actual, no por período)">
          {!embudo ? (
            <Skeleton className="h-32" />
          ) : (
            <Embudo
              pasos={[
                { etiqueta: 'Registrados', valor: embudo.registrados ?? 0 },
                { etiqueta: 'Pasaron por prueba', valor: embudo.paso_por_prueba ?? 0 },
                { etiqueta: 'Activos pagando', valor: embudo.activos_pagando ?? 0 },
                { etiqueta: 'Con algún pago aprobado', valor: embudo.con_algun_pago_aprobado ?? 0 },
              ]}
            />
          )}
        </SeccionCard>
      </div>
    </div>
  );
}
