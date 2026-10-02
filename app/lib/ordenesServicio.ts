import { generarTextoCondicionIngreso, type ChecklistIngreso } from './reparaciones';
import { getActor } from './actor';
import { vencimientoDesdeHoy } from './cuentaCorriente';
import { crearPlanFinanciacion } from './financiacion/servicio';

// Datos mínimos de una reparación necesarios para armar/actualizar su orden de
// cobro. Se aceptan además los campos del checklist de ingreso (para la nota de
// condición del equipo), por eso el intersecar con Partial<ChecklistIngreso>.
export type ReparacionParaOrden = {
  id: string;
  cliente_id: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  diagnostico: string | null;
  resultado_final: string | null;
  importe_total: number | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  forma_pago: string | null;
  orden_cobro_id: string | null;
  fecha_reparado: string | null;
} & Partial<ChecklistIngreso>;

// Pedido real de un cliente (2026-09): poder cobrar un Servicio Técnico a
// cuenta corriente o financiado, igual que ya se puede en Nueva Orden — antes
// "Forma de pago" acá era solo una etiqueta de texto, nunca generaba un cargo
// real ni un plan de cuotas. Solo aplica al CREAR la orden (no a un
// "actualizar" posterior): cambiar de forma de pago después de ya haber
// generado el cargo/plan necesita corregirse a mano, mismo criterio que ya
// tiene el resto del cobro de financiamiento.
export type CuentaCorrienteServicioTecnico = {
  moneda: string;
  plazoDias: number | null;
  financiar?: { cantidadCuotas: number; primeraFecha: string };
};

// ¿Esta orden ya generó su cargo a cuenta corriente (o un plan de cuotas)?
// Devuelve null si no se pudo verificar — quien llama NO debe asumir "no" en
// ese caso, porque cobrar dos veces la misma deuda es peor que pedir reintentar.
export async function ordenYaTieneCargoCuentaCorriente(supabase: any, ordenId: string): Promise<boolean | null> {
  const [movs, planes] = await Promise.all([
    supabase
      .from('cta_cte_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', ordenId)
      .eq('tipo', 'cargo')
      .eq('anulado', false),
    supabase
      .from('financiacion_planes')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', ordenId)
      .not('estado', 'in', '(anulado,cancelado)'),
  ]);
  if (movs.error || planes.error) return null;
  return (movs.count ?? 0) > 0 || (planes.count ?? 0) > 0;
}

// Arma (o actualiza, si ya existía desde que se recibió el equipo) la orden de
// cobro de una reparación y deja la reparación como "entregado". Es la MISMA
// lógica que usa la ficha de Servicio Técnico y la sección "Listos para cobrar"
// de Órdenes — una sola fuente de verdad para no duplicar boletas ni divergir.
export async function generarOrdenDeReparacion(
  supabase: any,
  r: ReparacionParaOrden,
  // false para una reparación "Cancelado / sin solución" a la que igual se
  // le genera una boleta (ej. costo de diagnóstico) — no tiene sentido que
  // eso la pase a "Entregado": el equipo sigue sin repararse, solo se está
  // cobrando (o dejando constancia con $0) el diagnóstico.
  opciones: {
    marcarEntregado?: boolean;
    sucursalId?: string | null;
    cuentaCorriente?: CuentaCorrienteServicioTecnico;
  } = {}
): Promise<{ ordenId: string | null; total: number; error: string | null }> {
  const marcarEntregado = opciones.marcarEntregado ?? true;
  const total = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);

  // Antes el cargo solo se generaba si la orden era "nueva" (!orden_cobro_id),
  // pero hoy TODA reparación con cliente ya nace con su orden desde la
  // recepción — así que el cargo a cuenta corriente/financiación nunca se
  // generaba y la deuda quedaba sin registrar. Lo que importa es si ESTA
  // orden ya tiene su cargo, no si se acaba de crear. Se verifica antes de
  // tocar nada, para no dejar una orden a medias si la verificación falla.
  let generarCargo = r.forma_pago === 'Cuenta corriente' && !!r.cliente_id && !!opciones.cuentaCorriente && total > 0.009;
  if (generarCargo && r.orden_cobro_id) {
    const yaTiene = await ordenYaTieneCargoCuentaCorriente(supabase, r.orden_cobro_id);
    if (yaTiene === null) {
      return { ordenId: null, total, error: 'No pudimos verificar si esta orden ya está cargada a la cuenta corriente. Probá de nuevo.' };
    }
    generarCargo = !yaTiene;
  }
  // Costo real de los repuestos usados en esta reparación (foto tomada al
  // momento de usarlos, ver reparaciones_repuestos.costo_unitario) — sin
  // esto, el ítem de la boleta quedaba con costo=null y Estadísticas no
  // podía calcular ninguna ganancia de taller (quedaba siempre en $0,
  // aunque "Ventas taller" sí tuviera montos). Se pasa siempre, incluso en
  // $0 (trabajo sin repuestos = 100% mano de obra, costo real cero), para
  // que esa reparación SÍ cuente como ganancia real y no quede afuera del
  // cálculo por tener costo=null.
  const { data: repuestosUsados } = await supabase
    .from('reparaciones_repuestos')
    .select('cantidad, costo_unitario')
    .eq('reparacion_id', r.id);
  const costoRepuestos = ((repuestosUsados as { cantidad: number; costo_unitario: number | null }[]) ?? []).reduce(
    (acc, u) => acc + (u.costo_unitario ?? 0) * (u.cantidad ?? 0),
    0
  );
  // Modelo/capacidad/color/IMEI se cargaron al recibir el equipo — sin esto,
  // al generar la orden de cobro se pisaba la línea de la boleta (que sí los
  // tenía desde el ingreso) con una que solo decía "Servicio técnico — modelo".
  const descripcion = `Servicio técnico — ${r.modelo || 'equipo'}${r.capacidad_gb ? ` ${r.capacidad_gb}GB` : ''}${
    r.color ? ` ${r.color}` : ''
  }${r.imei ? ` · IMEI ${r.imei}` : ''}${r.diagnostico ? `: ${r.diagnostico}` : ''}`;
  // Constancia de cómo llegó el equipo (para la boleta), sin frase de "no se
  // garantiza": ver generarTextoCondicionIngreso.
  const notaCondicion = generarTextoCondicionIngreso(r as ChecklistIngreso) || null;
  // Aclaraciones del técnico (diagnóstico + trabajo). Viajan a la orden; el
  // vendedor decide desde Órdenes si salen impresas en la boleta.
  const aclaracionesTecnico =
    [r.diagnostico ? `Diagnóstico: ${r.diagnostico}` : null, r.resultado_final ? `Trabajo realizado: ${r.resultado_final}` : null]
      .filter(Boolean)
      .join('\n') || null;

  let ordenId = r.orden_cobro_id;

  if (ordenId) {
    // Ya existía desde que se recibió el equipo — se actualiza en vez de crear
    // una segunda orden duplicada.
    const { error: updateError } = await supabase
      .from('ordenes')
      .update({ total, forma_pago: r.forma_pago || 'Efectivo', nota: notaCondicion, aclaraciones_tecnico: aclaracionesTecnico })
      .eq('id', ordenId);
    if (updateError) return { ordenId: null, total, error: 'No pudimos actualizar la orden: ' + updateError.message };

    const { data: itemExistente, error: itemBuscarError } = await supabase
      .from('orden_items')
      .select('id')
      .eq('orden_id', ordenId)
      .limit(1)
      .maybeSingle();
    // Si esto falla por un error real (no porque no exista el ítem), no hay que
    // asumir que no existe: insertar acá duplicaría la línea de la boleta.
    if (itemBuscarError) return { ordenId: null, total, error: 'No pudimos actualizar el ítem de la orden: ' + itemBuscarError.message };

    if (itemExistente) {
      await supabase.from('orden_items').update({ descripcion, precio_unitario: total, costo: costoRepuestos }).eq('id', itemExistente.id);
    } else {
      await supabase
        .from('orden_items')
        .insert({ orden_id: ordenId, descripcion, cantidad: 1, precio_unitario: total, costo: costoRepuestos, tipo: 'trabajo' });
    }
  } else {
    // Reparaciones sin cliente al recibirse (equipo propio) o cargadas antes de
    // que se armara la orden en el ingreso: se crea acá.
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .insert({
        cliente_id: r.cliente_id,
        forma_pago: r.forma_pago || 'Efectivo',
        total,
        estado: 'pendiente',
        nota: notaCondicion,
        aclaraciones_tecnico: aclaracionesTecnico,
        ...(opciones.sucursalId ? { sucursal_id: opciones.sucursalId } : {}),
      })
      .select()
      .single();
    if (ordenError || !orden) return { ordenId: null, total, error: 'No pudimos generar la orden: ' + (ordenError?.message || '') };

    ordenId = orden.id;
    await supabase.from('orden_items').insert({
      orden_id: orden.id,
      descripcion,
      cantidad: 1,
      precio_unitario: total,
      costo: costoRepuestos,
      tipo: 'trabajo',
    });
  }

  const cambiosReparacion: Record<string, unknown> = {
    orden_cobro_id: ordenId,
    fecha_entrega: new Date().toISOString(),
    estado_actualizado_at: new Date().toISOString(),
    // Si se saltó "Listo para entregar" (o esta reparación es de antes de
    // ese chequeo) no tiene fecha_reparado — sin esto no sumaba al ranking
    // de técnicos en Estadísticas pese a ser trabajo terminado.
    fecha_reparado: r.fecha_reparado ?? new Date().toISOString(),
  };
  if (marcarEntregado) cambiosReparacion.estado = 'entregado';

  const { error: repError } = await supabase.from('reparaciones').update(cambiosReparacion).eq('id', r.id);
  if (repError) return { ordenId, total, error: 'La orden se generó pero no pudimos actualizar la reparación: ' + repError.message };

  // Cuenta corriente / financiamiento: solo la primera vez (generarCargo ya
  // descartó las órdenes con cargo existente) y solo si de verdad queda algo
  // por cobrar — mismo criterio que Nueva Orden (montoCuentaCorriente > 0.009
  // en app/ordenes/nueva/page.tsx).
  if (generarCargo && opciones.cuentaCorriente && r.cliente_id) {
    const cc = opciones.cuentaCorriente;
    if (cc.financiar) {
      const resultadoPlan = await crearPlanFinanciacion(supabase, {
        clienteId: r.cliente_id,
        ordenId,
        moneda: cc.moneda,
        importeOriginal: total,
        entregaInicial: 0,
        cantidadCuotas: cc.financiar.cantidadCuotas,
        primeraFecha: cc.financiar.primeraFecha,
        observaciones: 'Financiación generada al cobrar un Servicio Técnico.',
        sucursalId: opciones.sucursalId ?? null,
      });
      if ('error' in resultadoPlan) return { ordenId, total, error: 'La orden se generó pero no pudimos crear el plan de financiación: ' + resultadoPlan.error };
    } else {
      const actor = getActor();
      const { error: movError } = await supabase.from('cta_cte_movimientos').insert({
        cliente_id: r.cliente_id,
        tipo: 'cargo',
        concepto: 'venta',
        monto: total,
        moneda: cc.moneda,
        orden_id: ordenId,
        vencimiento: vencimientoDesdeHoy(cc.plazoDias),
        registrado_por_nombre: actor?.nombre ?? null,
        registrado_por_foto_url: actor?.fotoUrl ?? null,
        ...(opciones.sucursalId ? { sucursal_id: opciones.sucursalId } : {}),
      });
      if (movError) return { ordenId, total, error: 'La orden se generó pero no pudimos cargarla a la cuenta corriente: ' + movError.message };
    }
  }

  return { ordenId, total, error: null };
}
