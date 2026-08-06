import { generarTextoCondicionIngreso, type ChecklistIngreso } from './reparaciones';

// Datos mínimos de una reparación necesarios para armar/actualizar su orden de
// cobro. Se aceptan además los campos del checklist de ingreso (para la nota de
// condición del equipo), por eso el intersecar con Partial<ChecklistIngreso>.
export type ReparacionParaOrden = {
  id: string;
  cliente_id: string | null;
  modelo: string | null;
  diagnostico: string | null;
  resultado_final: string | null;
  importe_total: number | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  forma_pago: string | null;
  orden_cobro_id: string | null;
} & Partial<ChecklistIngreso>;

// Arma (o actualiza, si ya existía desde que se recibió el equipo) la orden de
// cobro de una reparación y deja la reparación como "entregado". Es la MISMA
// lógica que usa la ficha de Servicio Técnico y la sección "Listos para cobrar"
// de Órdenes — una sola fuente de verdad para no duplicar boletas ni divergir.
export async function generarOrdenDeReparacion(
  supabase: any,
  r: ReparacionParaOrden
): Promise<{ ordenId: string | null; total: number; error: string | null }> {
  const total = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
  const descripcion = `Servicio técnico — ${r.modelo || 'equipo'}${r.diagnostico ? `: ${r.diagnostico}` : ''}`;
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
      await supabase.from('orden_items').update({ descripcion, precio_unitario: total }).eq('id', itemExistente.id);
    } else {
      await supabase.from('orden_items').insert({ orden_id: ordenId, descripcion, cantidad: 1, precio_unitario: total, tipo: 'trabajo' });
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
      tipo: 'trabajo',
    });
  }

  const { error: repError } = await supabase
    .from('reparaciones')
    .update({
      orden_cobro_id: ordenId,
      estado: 'entregado',
      fecha_entrega: new Date().toISOString(),
      estado_actualizado_at: new Date().toISOString(),
    })
    .eq('id', r.id);
  if (repError) return { ordenId, total, error: 'La orden se generó pero no pudimos actualizar la reparación: ' + repError.message };

  return { ordenId, total, error: null };
}
