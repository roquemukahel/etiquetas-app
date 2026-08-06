// Operaciones sobre comisiones. Las transiciones sensibles usan RPCs atómicos
// (security definer, filtran por negocio_actual) — el estado se valida en la BD.
// El gate por rol (gestionar_comisiones) se aplica en la UI, igual que en todo
// Qovento (el "actor" no es un usuario de auth propio).

export async function aprobarMovimientos(supabase: any, ids: string[]): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from('comision_movimientos')
    .update({ estado: 'aprobada', aprobada_at: new Date().toISOString() })
    .in('id', ids)
    .in('estado', ['generada']); // solo desde 'generada' (validación de transición)
  return { error: error?.message ?? null };
}

// Aprueba las 'generada' del vendedor y crea la liquidación con todas las
// 'aprobada' del rango. Devuelve el id de la liquidación.
export async function liquidarVendedor(
  supabase: any,
  vendedorId: string,
  desde: string | null,
  hasta: string | null
): Promise<{ liquidacionId: string | null; error: string | null }> {
  // 1. aprobar lo generado del vendedor (en el rango)
  let q = supabase
    .from('comision_movimientos')
    .update({ estado: 'aprobada', aprobada_at: new Date().toISOString() })
    .eq('vendedor_id', vendedorId)
    .eq('estado', 'generada');
  if (desde) q = q.gte('fecha_hecho', desde);
  if (hasta) q = q.lt('fecha_hecho', hasta + 'T23:59:59.999');
  const { error: eAprob } = await q;
  if (eAprob) return { liquidacionId: null, error: eAprob.message };

  // 2. crear la liquidación (RPC atómico)
  const { data, error } = await supabase.rpc('comision_crear_liquidacion', {
    p_vendedor: vendedorId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { liquidacionId: null, error: error.message };
  return { liquidacionId: (data as string) ?? null, error: null };
}

export async function registrarPagoLiquidacion(
  supabase: any,
  liquidacionId: string,
  monto: number,
  medio: string | null,
  referencia: string | null,
  usuario: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('comision_registrar_pago', {
    p_liquidacion: liquidacionId,
    p_monto: monto,
    p_medio: medio,
    p_referencia: referencia,
    p_usuario: usuario,
  });
  return { error: error?.message ?? null };
}

// Ajuste manual (bonificación/corrección). Requiere motivo. Nace 'aprobada'
// (lo carga un admin), listo para incluirse en la próxima liquidación.
export async function crearAjuste(
  supabase: any,
  args: { vendedorId: string; monto: number; positivo: boolean; motivo: string; moneda: string | null; usuario: string | null }
): Promise<{ error: string | null }> {
  const monto = Math.abs(args.monto);
  const { error } = await supabase.from('comision_movimientos').insert({
    vendedor_id: args.vendedorId,
    tipo_movimiento: args.positivo ? 'ajuste_positivo' : 'ajuste_negativo',
    fecha_hecho: new Date().toISOString(),
    base: 0,
    comision: args.positivo ? monto : -monto,
    moneda: args.moneda,
    estado: 'aprobada',
    motivo: args.motivo,
    usuario: args.usuario,
  });
  return { error: error?.message ?? null };
}

// Reversión de las comisiones de una venta (al cancelar/devolver). RPC atómico.
export async function revertirComisionesOrden(
  supabase: any,
  ordenId: string,
  motivo: string,
  usuario: string | null
): Promise<{ revertidas: number; error: string | null }> {
  const { data, error } = await supabase.rpc('comision_revertir_orden', {
    p_orden: ordenId,
    p_motivo: motivo,
    p_usuario: usuario,
  });
  if (error) return { revertidas: 0, error: error.message };
  return { revertidas: (data as number) ?? 0, error: null };
}
