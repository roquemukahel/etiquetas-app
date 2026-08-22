// ============================================================
// Métricas de Servicio Técnico (sección 23 del rediseño) — capa de
// datos PURA, mismo criterio que app/estadisticas/datos.ts: funciones
// que reciben datos ya traídos + fechas y devuelven números, sin
// Supabase ni Date.now() escondido adentro. El fetching vive en la
// página.
//
// Todo acá sale de columnas que YA EXISTEN y ya se guardan solas en el
// uso normal del módulo (nada de mock data): fecha_ingreso_servicio,
// fecha_reparado, fecha_entrega, presupuesto_estado/respondido_at
// (Fase 6), tipo_ingreso (Fase 6), reparaciones_repuestos (Fase 5).
// ============================================================

import { FINALIZADOS, esDemorado, infoEstado } from '../lib/reparaciones';

export type PeriodoMetricas = 'hoy' | '7d' | '30d' | '90d' | 'todo';

export const PERIODOS_METRICAS: { id: PeriodoMetricas; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
  { id: 'todo', label: 'Todo' },
];

export function rangoMetricas(periodo: PeriodoMetricas, ahora: Date): { desde: Date | null; hasta: Date } {
  if (periodo === 'todo') return { desde: null, hasta: ahora };
  const dias = periodo === 'hoy' ? 1 : periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90;
  return { desde: new Date(ahora.getTime() - dias * 86400000), hasta: ahora };
}

// Cuántos días de evolución mostrar en el gráfico según el período — un
// rango fijo y acotado (no depende de cuán vieja sea la reparación más
// antigua), así "Todo" no genera un gráfico de años ilegible.
export function diasEvolucionPara(periodo: PeriodoMetricas): number {
  if (periodo === 'hoy' || periodo === '7d') return 14;
  if (periodo === '30d') return 30;
  return 90;
}

function dentro(iso: string | null, desde: Date | null, hasta: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (desde && t < desde.getTime()) return false;
  return t <= hasta.getTime();
}

export type ReparacionMetrica = {
  id: string;
  modelo: string | null;
  estado: string;
  tecnico_id: string | null;
  fecha_ingreso_servicio: string;
  fecha_reparado: string | null;
  fecha_entrega: string | null;
  fecha_estimada: string | null;
  estado_actualizado_at: string;
  importe_total: number | null;
  presupuesto_estado: string | null;
  presupuesto_respondido_at: string | null;
  tipo_ingreso: string | null;
  trabajos_realizados: string[] | null;
  sucursal_id?: string | null;
};

export type RepuestoUsoMetrica = { reparacion_id: string; nombre_repuesto: string; cantidad: number; costo_unitario: number | null };
export type RepuestoMetrica = { id: string; nombre: string; cantidad_stock: number; cantidad_reservada: number; stock_minimo: number | null };

export type KpisMetricas = {
  ingresadas: number;
  terminadas: number;
  activas: number;
  demoradas: number;
  tiempoPermanenciaPromedioDias: number | null;
  pctEsperandoAprobacion: number;
  pctEsperandoRepuesto: number;
  tasaAprobacionPresupuestos: number | null;
  tasaSolucion: number | null;
  tasaReincidencia: number | null;
  garantias: number;
  retrabajos: number;
  facturacion: number;
  costoRepuestos: number;
  gananciaBruta: number;
  margenPct: number | null;
};

export function calcularKpis(
  reparaciones: ReparacionMetrica[],
  usosRepuestos: RepuestoUsoMetrica[],
  desde: Date | null,
  hasta: Date
): KpisMetricas {
  const ingresadasArr = reparaciones.filter((r) => dentro(r.fecha_ingreso_servicio, desde, hasta));
  const terminadasArr = reparaciones.filter((r) => r.estado === 'entregado' && dentro(r.fecha_entrega ?? r.fecha_reparado, desde, hasta));
  const activasArr = reparaciones.filter((r) => !FINALIZADOS.includes(r.estado));
  const demoradasArr = activasArr.filter((r) => esDemorado(r));

  const conPermanencia = reparaciones.filter((r) => r.fecha_reparado && dentro(r.fecha_reparado, desde, hasta));
  const tiempoPermanenciaPromedioDias =
    conPermanencia.length > 0
      ? conPermanencia.reduce(
          (acc, r) => acc + (new Date(r.fecha_reparado as string).getTime() - new Date(r.fecha_ingreso_servicio).getTime()),
          0
        ) /
        conPermanencia.length /
        86400000
      : null;

  const pctEsperandoAprobacion = activasArr.length > 0 ? (activasArr.filter((r) => r.estado === 'esperando_aprobacion').length / activasArr.length) * 100 : 0;
  const pctEsperandoRepuesto = activasArr.length > 0 ? (activasArr.filter((r) => r.estado === 'esperando_repuesto').length / activasArr.length) * 100 : 0;

  const respondidos = reparaciones.filter((r) => dentro(r.presupuesto_respondido_at, desde, hasta));
  const aprobados = respondidos.filter((r) => r.presupuesto_estado === 'aprobado').length;
  const tasaAprobacionPresupuestos = respondidos.length > 0 ? (aprobados / respondidos.length) * 100 : null;

  const finalizadasPeriodo = reparaciones.filter((r) => (r.estado === 'entregado' || r.estado === 'cancelado') && dentro(r.estado_actualizado_at, desde, hasta));
  const solucionadas = finalizadasPeriodo.filter((r) => r.estado === 'entregado').length;
  const tasaSolucion = finalizadasPeriodo.length > 0 ? (solucionadas / finalizadasPeriodo.length) * 100 : null;

  const reincidencias = ingresadasArr.filter((r) => r.tipo_ingreso === 'retrabajo' || r.tipo_ingreso === 'reincidencia_no_cubierta').length;
  const tasaReincidencia = ingresadasArr.length > 0 ? (reincidencias / ingresadasArr.length) * 100 : null;
  const garantias = ingresadasArr.filter((r) => r.tipo_ingreso === 'garantia').length;
  const retrabajos = ingresadasArr.filter((r) => r.tipo_ingreso === 'retrabajo').length;

  const facturacion = terminadasArr.reduce((acc, r) => acc + (r.importe_total ?? 0), 0);
  const idsTerminadas = new Set(terminadasArr.map((r) => r.id));
  const costoRepuestos = usosRepuestos.filter((u) => idsTerminadas.has(u.reparacion_id)).reduce((acc, u) => acc + (u.costo_unitario ?? 0) * u.cantidad, 0);
  const gananciaBruta = facturacion - costoRepuestos;
  const margenPct = facturacion > 0 ? (gananciaBruta / facturacion) * 100 : null;

  return {
    ingresadas: ingresadasArr.length,
    terminadas: terminadasArr.length,
    activas: activasArr.length,
    demoradas: demoradasArr.length,
    tiempoPermanenciaPromedioDias,
    pctEsperandoAprobacion,
    pctEsperandoRepuesto,
    tasaAprobacionPresupuestos,
    tasaSolucion,
    tasaReincidencia,
    garantias,
    retrabajos,
    facturacion,
    costoRepuestos,
    gananciaBruta,
    margenPct,
  };
}

export type ContadorNombre = { nombre: string; valor: number };

export function serviciosFrecuentes(reparaciones: ReparacionMetrica[], desde: Date | null, hasta: Date, limite = 8): ContadorNombre[] {
  const mapa = new Map<string, number>();
  for (const r of reparaciones) {
    if (!dentro(r.fecha_ingreso_servicio, desde, hasta)) continue;
    for (const t of r.trabajos_realizados ?? []) mapa.set(t, (mapa.get(t) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

export function modelosFrecuentes(reparaciones: ReparacionMetrica[], desde: Date | null, hasta: Date, limite = 8): ContadorNombre[] {
  const mapa = new Map<string, number>();
  for (const r of reparaciones) {
    if (!dentro(r.fecha_ingreso_servicio, desde, hasta)) continue;
    const nombre = r.modelo || 'Sin modelo';
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

export function repuestosMasUsados(
  usos: RepuestoUsoMetrica[],
  reparaciones: ReparacionMetrica[],
  desde: Date | null,
  hasta: Date,
  limite = 8
): ContadorNombre[] {
  const idsPeriodo = new Set(reparaciones.filter((r) => dentro(r.fecha_ingreso_servicio, desde, hasta)).map((r) => r.id));
  const mapa = new Map<string, number>();
  for (const u of usos) {
    if (!idsPeriodo.has(u.reparacion_id)) continue;
    mapa.set(u.nombre_repuesto, (mapa.get(u.nombre_repuesto) ?? 0) + u.cantidad);
  }
  return Array.from(mapa.entries())
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

const ORDEN_EMBUDO = ['recibido', 'esperando_diagnostico', 'esperando_aprobacion', 'esperando_repuesto', 'en_reparacion', 'listo_para_entregar'];

export function embudoEstados(reparaciones: ReparacionMetrica[]): ContadorNombre[] {
  const activas = reparaciones.filter((r) => !FINALIZADOS.includes(r.estado));
  return ORDEN_EMBUDO.map((estado) => ({ nombre: infoEstado(estado).label, valor: activas.filter((r) => r.estado === estado).length }));
}

export type PuntoEvolucion = { label: string; valor: number };

export function serieIngresadas(reparaciones: ReparacionMetrica[], hasta: Date, dias: number): PuntoEvolucion[] {
  const puntos: PuntoEvolucion[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = new Date(hasta);
    dia.setDate(dia.getDate() - i);
    dia.setHours(0, 0, 0, 0);
    const finDia = new Date(dia);
    finDia.setHours(23, 59, 59, 999);
    const valor = reparaciones.filter((r) => dentro(r.fecha_ingreso_servicio, dia, finDia)).length;
    puntos.push({ label: dia.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''), valor });
  }
  return puntos;
}

export type OrdenAbierta = { id: string; label: string; dias: number };

export function ordenesAbiertasPorAntiguedad(reparaciones: ReparacionMetrica[], ahora: Date, limite = 8): OrdenAbierta[] {
  return reparaciones
    .filter((r) => !FINALIZADOS.includes(r.estado))
    .map((r) => ({ id: r.id, label: r.modelo || 'equipo', dias: Math.floor((ahora.getTime() - new Date(r.fecha_ingreso_servicio).getTime()) / 86400000) }))
    .sort((a, b) => b.dias - a.dias)
    .slice(0, limite);
}

export function cargaPorTecnico(reparaciones: ReparacionMetrica[], nombreTecnico: (id: string) => string, limite = 8): ContadorNombre[] {
  const mapa = new Map<string, number>();
  for (const r of reparaciones) {
    if (FINALIZADOS.includes(r.estado) || !r.tecnico_id) continue;
    const nombre = nombreTecnico(r.tecnico_id);
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

export function repuestosBajaRotacion(
  repuestos: RepuestoMetrica[],
  usos: RepuestoUsoMetrica[],
  reparaciones: ReparacionMetrica[],
  desde: Date | null,
  hasta: Date,
  limite = 8
): ContadorNombre[] {
  const idsPeriodo = new Set(reparaciones.filter((r) => dentro(r.fecha_ingreso_servicio, desde, hasta)).map((r) => r.id));
  const usados = new Set(usos.filter((u) => idsPeriodo.has(u.reparacion_id)).map((u) => u.nombre_repuesto));
  return repuestos
    .filter((r) => r.cantidad_stock > 0 && !usados.has(r.nombre))
    .map((r) => ({ nombre: r.nombre, valor: r.cantidad_stock }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

export function repuestosStockCritico(repuestos: RepuestoMetrica[], limite = 8): ContadorNombre[] {
  return repuestos
    .filter((r) => r.stock_minimo != null && r.cantidad_stock - r.cantidad_reservada <= (r.stock_minimo ?? 0))
    .map((r) => ({ nombre: r.nombre, valor: r.cantidad_stock - r.cantidad_reservada }))
    .sort((a, b) => a.valor - b.valor)
    .slice(0, limite);
}
