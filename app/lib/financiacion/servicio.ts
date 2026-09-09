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
import { CAJA_DE_COBRANZA } from '../caja/motor';
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

// ---------- Cobrar una cuota/cta-corriente, generando su propia boleta ----------
// Pedido real de un cliente: un cobro de financiamiento no dejaba ningún
// rastro en Órdenes (nunca se tocaba `ordenes`) — si una vendedora cobraba
// algo por error, la única forma de notarlo era entrando puntualmente a la
// ficha de ESE cliente. Ahora cada cobro genera su propia orden/boleta, YA
// pagada (no hay nada más que cobrar), enlazada a la venta original cuando
// existe — así aparece en Órdenes como cualquier otra venta y Caja puede
// linkearla como boleta real en vez de un movimiento suelto sin destino.
// Reemplaza el insert manual a pagos/cta_cte_movimientos que antes vivía
// directo en la ficha del cliente (ver registrarPago en
// app/clientes/[id]/page.tsx) — misma lógica, un solo lugar.
export async function registrarCobroFinanciamiento(
  supabase: SupabaseClient,
  params: {
    clienteId: string;
    monto: number;
    medio: string;
    moneda: string;
    sucursalId?: string | null;
    observacion?: string | null;
    ordenOriginalId?: string | null;
    cuotaIdElegida?: string;
  }
): Promise<{ ordenId: string; avisoCuotas?: string } | { error: string }> {
  const actor = getActor();

  const { data: orden, error: ordenError } = await supabase
    .from('ordenes')
    .insert({
      cliente_id: params.clienteId,
      estado: 'pagada',
      total: params.monto,
      moneda: params.moneda,
      nota: 'Cobro de financiamiento / cuenta corriente.',
      orden_original_id: params.ordenOriginalId ?? null,
      ...(params.sucursalId ? { sucursal_id: params.sucursalId } : {}),
    })
    .select('id')
    .single();
  if (ordenError || !orden) return { error: 'No pudimos generar la boleta del cobro: ' + (ordenError?.message ?? '') };

  const { error: itemError } = await supabase.from('orden_items').insert({
    orden_id: orden.id,
    descripcion: 'Cobro de financiamiento / cuenta corriente',
    cantidad: 1,
    precio_unitario: params.monto,
    tipo: 'financiamiento',
  });
  if (itemError) return { error: 'No pudimos armar la boleta del cobro: ' + itemError.message };

  const { data: pago, error: pagoError } = await supabase
    .from('pagos')
    .insert({
      cliente_id: params.clienteId,
      orden_id: orden.id,
      medio: params.medio,
      monto: params.monto,
      moneda: params.moneda,
      // Cobrar una cuenta corriente/cuota ya existente siempre es plata de
      // la caja Financiamiento (a diferencia del pago EN EL MOMENTO de una
      // venta, que puede ser Venta diaria o Financiamiento según si deja
      // deuda — ver app/lib/caja/motor.ts).
      caja_tipo: CAJA_DE_COBRANZA,
      observacion: params.observacion?.trim() || null,
      registrado_por_nombre: actor?.nombre ?? null,
      registrado_por_foto_url: actor?.fotoUrl ?? null,
      ...(params.sucursalId ? { sucursal_id: params.sucursalId } : {}),
    })
    .select('id')
    .single();
  if (pagoError || !pago) return { error: 'La boleta se generó pero no pudimos registrar el pago: ' + (pagoError?.message ?? '') };

  const { error: movError } = await supabase.from('cta_cte_movimientos').insert({
    cliente_id: params.clienteId,
    tipo: 'abono',
    concepto: 'pago',
    monto: params.monto,
    moneda: params.moneda,
    pago_id: pago.id,
    observacion: params.observacion?.trim() || null,
    registrado_por_nombre: actor?.nombre ?? null,
    registrado_por_foto_url: actor?.fotoUrl ?? null,
    ...(params.sucursalId ? { sucursal_id: params.sucursalId } : {}),
  });
  if (movError) return { error: 'El pago se guardó pero no se pudo asentar en la cuenta corriente: ' + movError.message };

  // Si esto falla, la plata YA está cobrada y asentada arriba — no se debe
  // reportar como si todo hubiera fallado, solo avisar que el reparto entre
  // cuotas quedó pendiente (mismo criterio que ya usaba registrarPago).
  const resultadoCuotas = await aplicarPagoAFinanciacion(supabase, {
    pagoId: pago.id,
    clienteId: params.clienteId,
    monto: params.monto,
    moneda: params.moneda,
    cuotaIdElegida: params.cuotaIdElegida,
  });

  await registrarAuditoria(supabase, {
    accion: `cobró ${params.monto} de financiamiento/cuenta corriente`,
    entidad: 'cliente',
    entidadId: params.clienteId,
    valorNuevo: { monto: params.monto, medio: params.medio, orden_id: orden.id },
  });

  if ('error' in resultadoCuotas) {
    return { ordenId: orden.id, avisoCuotas: 'El pago se registró, pero no pudimos aplicarlo a las cuotas: ' + resultadoCuotas.error };
  }
  return { ordenId: orden.id };
}

// ---------- Ajuste (reduce deuda futura, sin tocar cuotas pagadas) ----------
export async function ajustarCuotasFinanciacion(
  supabase: SupabaseClient,
  params: { planId: string; monto: number; motivo: string; cuotaIds?: string[]; sucursalId?: string | null }
): Promise<{ ok: true } | { error: string }> {
  const actor = getActor();
  const { error } = await supabase.rpc('financiacion_ajustar_cuotas', {
    p_plan_id: params.planId,
    p_monto: params.monto,
    p_motivo: params.motivo.trim(),
    p_cuota_ids: params.cuotaIds && params.cuotaIds.length > 0 ? params.cuotaIds : null,
    p_usuario: actor?.nombre ?? null,
    p_sucursal_id: params.sucursalId ?? null,
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
