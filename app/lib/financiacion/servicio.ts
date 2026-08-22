// ============================================================
// Capa de servicio de financiación — el puente entre el motor puro
// (motor.ts) y Supabase. Acá SÍ hay llamadas a la base, pero el cálculo en
// sí (cronograma, redondeo, a qué cuota aplica un pago, proyección) siempre
// pasa primero por el motor — este archivo nunca inventa un importe.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from '../actor';
import { registrarAuditoria } from '../auditoria';
import { decimalesMoneda } from '../monedas';
import {
  generarCronograma,
  aplicarPagoACuotas,
  aFechaISO,
  type CuotaParaAplicar,
} from './motor';

export type PlanFinanciacion = {
  id: string;
  cliente_id: string;
  orden_id: string | null;
  moneda: string;
  importe_original: number;
  entrega_inicial: number;
  importe_financiado: number;
  cantidad_cuotas: number;
  primera_cuota_fecha: string;
  estado: 'activo' | 'completado' | 'anulado' | 'reprogramado';
  observaciones: string | null;
  creado_por: string | null;
  plan_anterior_id: string | null;
  created_at: string;
};

export type CuotaFinanciacion = {
  id: string;
  plan_id: string;
  numero: number;
  fecha_vencimiento: string;
  importe_original: number;
  importe_pagado: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
  fecha_pago_completo: string | null;
};

// ---------- Crear un plan ----------
export async function crearPlanFinanciacion(
  supabase: SupabaseClient,
  params: {
    clienteId: string;
    ordenId: string | null;
    moneda: string;
    importeOriginal: number;
    entregaInicial: number;
    cantidadCuotas: number;
    primeraFecha: string; // YYYY-MM-DD
    observaciones?: string;
    sucursalId?: string | null;
  }
): Promise<{ planId: string; cuotas: ReturnType<typeof generarCronograma> } | { error: string }> {
  const importeFinanciado = params.importeOriginal - params.entregaInicial;
  if (importeFinanciado <= 0) return { error: 'La entrega inicial no puede ser mayor o igual al importe de la venta.' };

  let cuotas;
  try {
    cuotas = generarCronograma({
      importeFinanciado,
      cantidadCuotas: params.cantidadCuotas,
      primeraFecha: params.primeraFecha,
      decimales: decimalesMoneda(params.moneda),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo armar el cronograma.' };
  }

  const actor = getActor();
  const { data, error } = await supabase.rpc('financiacion_crear_plan', {
    p_cliente_id: params.clienteId,
    p_orden_id: params.ordenId,
    p_moneda: params.moneda,
    p_importe_original: params.importeOriginal,
    p_entrega_inicial: params.entregaInicial,
    p_importe_financiado: importeFinanciado,
    p_cuotas: cuotas,
    p_observaciones: params.observaciones?.trim() || null,
    p_usuario: actor?.nombre ?? null,
    p_sucursal_id: params.sucursalId ?? null,
  });
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `creó un plan de financiación en ${params.cantidadCuotas} cuota${params.cantidadCuotas === 1 ? '' : 's'} (importe financiado ${importeFinanciado})`,
    entidad: 'plan_financiacion',
    entidadId: data as string,
    valorNuevo: { cliente_id: params.clienteId, importe_financiado: importeFinanciado, cuotas: params.cantidadCuotas },
  });

  return { planId: data as string, cuotas };
}

// ---------- Registrar un pago y aplicarlo a cuota(s) ----------
// `pagoId` YA debe existir en la tabla `pagos` (insertado por el flujo
// existente de "Registrar pago" en la ficha del cliente) — este servicio no
// crea el pago, solo lo reparte entre las cuotas pendientes del cliente.
export async function aplicarPagoAFinanciacion(
  supabase: SupabaseClient,
  params: {
    pagoId: string;
    clienteId: string;
    monto: number;
    moneda: string;
    cuotaIdElegida?: string;
  }
): Promise<{ aplicado: number; sobrante: number } | { error: string }> {
  const { data: cuotasData, error: fetchError } = await supabase
    .from('financiacion_cuotas')
    .select('id, fecha_vencimiento, importe_original, importe_pagado, estado, financiacion_planes!inner(cliente_id, moneda, estado)')
    .eq('financiacion_planes.cliente_id', params.clienteId)
    .eq('financiacion_planes.moneda', params.moneda)
    .eq('financiacion_planes.estado', 'activo')
    .eq('estado', 'pendiente');
  if (fetchError) return { error: 'No pudimos revisar las cuotas pendientes: ' + fetchError.message };

  const cuotas: CuotaParaAplicar[] = ((cuotasData as any[]) ?? []).map((c) => ({
    id: c.id,
    fecha_vencimiento: c.fecha_vencimiento,
    importe_original: c.importe_original,
    importe_pagado: c.importe_pagado,
    estado: c.estado,
  }));
  if (cuotas.length === 0) return { aplicado: 0, sobrante: params.monto };

  const { asignaciones, sobrante } = aplicarPagoACuotas({
    cuotas,
    monto: params.monto,
    decimales: decimalesMoneda(params.moneda),
    hoy: new Date(),
    cuotaIdElegida: params.cuotaIdElegida,
  });
  if (asignaciones.length === 0) return { aplicado: 0, sobrante };

  const actor = getActor();
  const { error } = await supabase.rpc('financiacion_aplicar_pago', {
    p_pago_id: params.pagoId,
    p_asignaciones: asignaciones.map((a) => ({ cuota_id: a.cuota_id, monto: a.monto })),
    p_usuario: actor?.nombre ?? null,
  });
  if (error) return { error: error.message };

  const aplicado = asignaciones.reduce((acc, a) => acc + a.monto, 0);
  return { aplicado, sobrante };
}

// ---------- Ajuste (reduce deuda futura, sin tocar cuotas pagadas) ----------
export async function ajustarCuotasFinanciacion(
  supabase: SupabaseClient,
  params: { planId: string; monto: number; motivo: string; cuotaIds?: string[] }
): Promise<{ ok: true } | { error: string }> {
  const actor = getActor();
  const { error } = await supabase.rpc('financiacion_ajustar_cuotas', {
    p_plan_id: params.planId,
    p_monto: params.monto,
    p_motivo: params.motivo.trim(),
    p_cuota_ids: params.cuotaIds && params.cuotaIds.length > 0 ? params.cuotaIds : null,
    p_usuario: actor?.nombre ?? null,
  });
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `ajustó un plan de financiación (−${params.monto}): ${params.motivo.trim()}`,
    entidad: 'plan_financiacion',
    entidadId: params.planId,
    valorNuevo: { monto: params.monto, motivo: params.motivo.trim(), cuotas: params.cuotaIds ?? 'automático' },
  });
  return { ok: true };
}

// ---------- Anular un plan completo ----------
export async function anularPlanFinanciacion(
  supabase: SupabaseClient,
  params: { planId: string; motivo: string }
): Promise<{ ok: true } | { error: string }> {
  const actor = getActor();
  const { error } = await supabase.rpc('financiacion_anular_plan', {
    p_plan_id: params.planId,
    p_motivo: params.motivo.trim(),
    p_usuario: actor?.nombre ?? null,
  });
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `anuló un plan de financiación: ${params.motivo.trim()}`,
    entidad: 'plan_financiacion',
    entidadId: params.planId,
  });
  return { ok: true };
}

// ---------- Reprogramar: crea un plan NUEVO con cronograma nuevo, conserva
// el anterior íntegro (nunca se borra ni se reescribe el histórico) ----------
// Todo (anular las cuotas viejas + crear el plan nuevo) pasa por UN solo RPC
// (financiacion_reprogramar), que corre como una única transacción en la
// base — si algo falla a mitad de camino, Postgres deshace todo. Antes esto
// eran 2 llamadas separadas desde acá: si la primera (anular) terminaba bien
// y la segunda (crear) fallaba, la deuda del plan viejo quedaba anulada sin
// que se llegara a crear el reemplazo.
export async function reprogramarFinanciacion(
  supabase: SupabaseClient,
  params: {
    planAnteriorId: string;
    clienteId: string;
    ordenId: string | null;
    moneda: string;
    saldoARepgramar: number; // lo que queda pendiente del plan viejo, se transforma en el nuevo cronograma
    cantidadCuotas: number;
    primeraFecha: string;
    motivo: string;
    sucursalId?: string | null;
  }
): Promise<{ planId: string } | { error: string }> {
  let cuotas;
  try {
    cuotas = generarCronograma({
      importeFinanciado: params.saldoARepgramar,
      cantidadCuotas: params.cantidadCuotas,
      primeraFecha: params.primeraFecha,
      decimales: decimalesMoneda(params.moneda),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo armar el cronograma.' };
  }

  const actor = getActor();
  const { data, error } = await supabase.rpc('financiacion_reprogramar', {
    p_plan_anterior_id: params.planAnteriorId,
    p_cliente_id: params.clienteId,
    p_orden_id: params.ordenId,
    p_moneda: params.moneda,
    p_saldo_a_reprogramar: params.saldoARepgramar,
    p_cuotas: cuotas,
    p_motivo: params.motivo.trim(),
    p_usuario: actor?.nombre ?? null,
    p_sucursal_id: params.sucursalId ?? null,
  });
  if (error) return { error: error.message };

  await registrarAuditoria(supabase, {
    accion: `reprogramó un plan de financiación en ${params.cantidadCuotas} cuota${params.cantidadCuotas === 1 ? '' : 's'}: ${params.motivo.trim()}`,
    entidad: 'plan_financiacion',
    entidadId: data as string,
    valorAnterior: { plan_anterior_id: params.planAnteriorId },
    valorNuevo: { saldo_reprogramado: params.saldoARepgramar, cuotas: params.cantidadCuotas },
  });

  return { planId: data as string };
}

// ---------- Consultas ----------
export async function obtenerPlanesDeCliente(supabase: SupabaseClient, clienteId: string): Promise<PlanFinanciacion[]> {
  const { data } = await supabase
    .from('financiacion_planes')
    .select('id, cliente_id, orden_id, moneda, importe_original, entrega_inicial, importe_financiado, cantidad_cuotas, primera_cuota_fecha, estado, observaciones, creado_por, plan_anterior_id, created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });
  return (data as PlanFinanciacion[]) ?? [];
}

export async function obtenerCuotasDePlan(supabase: SupabaseClient, planId: string): Promise<CuotaFinanciacion[]> {
  const { data } = await supabase
    .from('financiacion_cuotas')
    .select('id, plan_id, numero, fecha_vencimiento, importe_original, importe_pagado, estado, fecha_pago_completo')
    .eq('plan_id', planId)
    .order('numero', { ascending: true });
  return (data as CuotaFinanciacion[]) ?? [];
}

export { aFechaISO };
