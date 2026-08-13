import { generarTextoCondicionIngreso, type ChecklistIngreso } from './reparaciones';

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
  // Ítem PUNTUAL (dentro de orden_cobro_id) que representa a esta reparación.
  // Sin esto había que asumir "el primer ítem de la orden", lo que rompía en
  // cuanto la orden tenía más de un equipo (varios derivados de la misma
  // boleta, o varios recibidos juntos en Servicio Técnico) o algún otro ítem
  // (un accesorio vendido junto con el ingreso).
  orden_item_id: string | null;
} & Partial<ChecklistIngreso>;

// Arma (o actualiza, si ya existía desde que se recibió el equipo) la orden de
// cobro de una reparación y deja la reparación como "entregado". Es la MISMA
// lógica que usa la ficha de Servicio Técnico y la sección "Listos para cobrar"
// de Órdenes — una sola fuente de verdad para no duplicar boletas ni divergir.
export async function generarOrdenDeReparacion(
  supabase: any,
  r: ReparacionParaOrden
): Promise<{ ordenId: string | null; total: number; error: string | null }> {
  // Presupuesto que cargó el técnico. Si no cargó nada (0), NO hay que pisar
  // el precio del ítem con $0 — puede que el vendedor ya le hubiera puesto un
  // precio real al recibir el equipo (ej. "Cambio de pantalla — $50"), y
  // perderlo era justamente el bug reportado ("la boleta salía en $0").
  const presupuestoTecnico = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
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
  let total: number;

  if (ordenId) {
    // Ya existía desde que se recibió el equipo (o desde que se derivó desde
    // una orden) — se actualiza en vez de crear una segunda orden duplicada.
    if (r.orden_item_id) {
      const { error: itemUpdError } = await supabase
        .from('orden_items')
        .update({ descripcion, ...(presupuestoTecnico > 0 ? { precio_unitario: presupuestoTecnico } : {}) })
        .eq('id', r.orden_item_id);
      if (itemUpdError) return { ordenId: null, total: 0, error: 'No pudimos actualizar el ítem de la orden: ' + itemUpdError.message };
    } else {
      // Reparación vieja, de antes de que existiera orden_item_id: mismo
      // criterio que antes (el primer ítem de la orden), como último recurso.
      const { data: itemExistente, error: itemBuscarError } = await supabase
        .from('orden_items')
        .select('id')
        .eq('orden_id', ordenId)
        .limit(1)
        .maybeSingle();
      if (itemBuscarError) {
        return { ordenId: null, total: 0, error: 'No pudimos actualizar el ítem de la orden: ' + itemBuscarError.message };
      }
      if (itemExistente) {
        await supabase
          .from('orden_items')
          .update({ descripcion, ...(presupuestoTecnico > 0 ? { precio_unitario: presupuestoTecnico } : {}) })
          .eq('id', itemExistente.id);
      } else {
        await supabase
          .from('orden_items')
          .insert({ orden_id: ordenId, descripcion, cantidad: 1, precio_unitario: presupuestoTecnico, tipo: 'trabajo' });
      }
    }

    // El total se recalcula sumando TODOS los ítems de la orden (puede haber
    // más de uno: otro equipo de la misma boleta, un accesorio, etc.) con el
    // mismo cálculo que usa "Editar orden" (subtotal con impuesto, menos
    // anticipo y plan canje) — no se pisa con solo el presupuesto de ESTA
    // reparación, que borraría el resto de la boleta.
    const [{ data: itemsOrden }, { data: ordenActual }] = await Promise.all([
      supabase.from('orden_items').select('cantidad, precio_unitario').eq('orden_id', ordenId),
      supabase.from('ordenes').select('anticipo, impuesto_porcentaje, monto_canje').eq('id', ordenId).single(),
    ]);
    const subtotalOrden = ((itemsOrden as { cantidad: number; precio_unitario: number }[]) ?? []).reduce(
      (acc, i) => acc + i.cantidad * i.precio_unitario,
      0
    );
    total =
      subtotalOrden * (1 + ((ordenActual?.impuesto_porcentaje as number) || 0) / 100) -
      ((ordenActual?.anticipo as number) || 0) -
      ((ordenActual?.monto_canje as number) || 0);

    const { error: updateError } = await supabase
      .from('ordenes')
      .update({ total, forma_pago: r.forma_pago || 'Efectivo', nota: notaCondicion, aclaraciones_tecnico: aclaracionesTecnico })
      .eq('id', ordenId);
    if (updateError) return { ordenId: null, total, error: 'No pudimos actualizar la orden: ' + updateError.message };
  } else {
    // Reparaciones sin cliente al recibirse (equipo propio) o cargadas antes de
    // que se armara la orden en el ingreso: se crea acá.
    total = presupuestoTecnico;
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
    const { data: itemNuevo } = await supabase
      .from('orden_items')
      .insert({
        orden_id: orden.id,
        descripcion,
        cantidad: 1,
        precio_unitario: total,
        tipo: 'trabajo',
      })
      .select('id')
      .single();

    const { error: repError } = await supabase
      .from('reparaciones')
      .update({
        orden_cobro_id: ordenId,
        orden_item_id: itemNuevo?.id ?? null,
        estado: 'entregado',
        fecha_entrega: new Date().toISOString(),
        estado_actualizado_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (repError) return { ordenId, total, error: 'La orden se generó pero no pudimos actualizar la reparación: ' + repError.message };

    return { ordenId, total, error: null };
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
