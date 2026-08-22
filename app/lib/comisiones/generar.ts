// Generación de comisiones de una venta. Se ejecuta EN EL SERVIDOR (server
// action) — el navegador nunca calcula importes. Es idempotente: correrla dos
// veces sobre la misma venta no duplica movimientos (idempotency_key + upsert).
import { calcularComisionVenta, type Regla, type Venta } from './motor';
import { decimalesMoneda } from './tipos';
import { ESTADOS_COBRADOS } from '../../estadisticas/datos';

export type ResultadoGeneracion = { generadas: number; error: string | null; motivo?: string };

type FilaItem = { id: string; tipo: string | null; producto_id: string | null; cantidad: number; precio_unitario: number; costo: number | null };

export async function generarComisionesDeOrden(supabase: any, ordenId: string): Promise<ResultadoGeneracion> {
  // 1. Venta + ítems
  const { data: orden, error: eOrden } = await supabase
    .from('ordenes')
    .select('id, negocio_id, vendedor_id, tipo_venta, estado, created_at, moneda, orden_items ( id, tipo, producto_id, cantidad, precio_unitario, costo )')
    .eq('id', ordenId)
    .single();
  if (eOrden || !orden) return { generadas: 0, error: eOrden?.message || 'Venta no encontrada' };

  // 2. Config del negocio
  const { data: negocio } = await supabase
    .from('negocios')
    .select('comisiones_activas, comisiones_desde, comisiones_generar_en, comision_plan_default_id, moneda')
    .eq('id', orden.negocio_id)
    .single();
  if (!negocio?.comisiones_activas) return { generadas: 0, error: null, motivo: 'Comisiones desactivadas' };

  // 3. Momento de generación. En Qovento una orden creada YA es una venta real
  //    (aunque quede 'pendiente' de cobro), así que por defecto ('confirmada')
  //    genera igual. Solo el modo 'cobrada' (opcional, aún sin UI) exige que la
  //    venta esté pagada/entregada.
  const generarEn = negocio.comisiones_generar_en || 'confirmada';
  if (generarEn === 'cobrada' && !ESTADOS_COBRADOS.includes(orden.estado)) {
    return { generadas: 0, error: null, motivo: 'La venta todavía no está cobrada' };
  }

  // 4. Vigencia: no comisionar ventas anteriores a la fecha de activación
  if (negocio.comisiones_desde && new Date(orden.created_at) < new Date(negocio.comisiones_desde + 'T00:00:00'))
    return { generadas: 0, error: null, motivo: 'Venta anterior a la vigencia de comisiones' };

  // 5. Vendedor responsable
  if (!orden.vendedor_id) return { generadas: 0, error: null, motivo: 'La venta no tiene vendedor asignado' };

  // 6. Plan del vendedor (asignación activa) o el plan predeterminado del negocio
  let planId: string | null = negocio.comision_plan_default_id ?? null;
  const { data: asignacion } = await supabase
    .from('comision_plan_vendedores')
    .select('plan_id')
    .eq('vendedor_id', orden.vendedor_id)
    .eq('activo', true)
    .maybeSingle();
  if (asignacion?.plan_id) planId = asignacion.plan_id;
  if (!planId) return { generadas: 0, error: null, motivo: 'El vendedor no tiene plan de comisión' };

  const { data: plan } = await supabase.from('comision_planes').select('id, version, activo').eq('id', planId).single();
  if (!plan?.activo) return { generadas: 0, error: null, motivo: 'El plan de comisión está inactivo' };

  const { data: reglasData } = await supabase
    .from('comision_reglas')
    .select('id, tipo_calculo, valor, alcance, tipo_item, producto_id, prioridad')
    .eq('plan_id', planId)
    .eq('activo', true);
  const reglas: Regla[] = (reglasData ?? []) as Regla[];
  if (reglas.length === 0) return { generadas: 0, error: null, motivo: 'El plan no tiene reglas' };

  // 7. Calcular (motor puro)
  const decimales = decimalesMoneda(orden.moneda || negocio.moneda);
  const items: FilaItem[] = orden.orden_items ?? [];
  const venta: Venta = {
    tipo_venta: orden.tipo_venta === 'mayorista' ? 'mayorista' : 'minorista',
    lineas: items.map((it) => ({
      id: it.id,
      tipo_item: it.tipo || 'producto',
      producto_id: it.producto_id ?? null,
      cantidad: it.cantidad || 0,
      precio_unitario: it.precio_unitario || 0,
      costo_unitario: it.costo ?? null,
    })),
  };
  const res = calcularComisionVenta(venta, reglas, decimales);

  // 8. Armar movimientos (una comisión por línea con comisión != 0). Snapshot
  //    de la regla aplicada, para que editar la regla NO cambie el histórico.
  const moneda = orden.moneda || negocio.moneda || null;
  const filas = res.detalle
    .filter((d) => d.comision !== 0 && d.regla_id)
    .map((d) => {
      const regla = reglas.find((r) => r.id === d.regla_id) || null;
      const item = d.linea_id === '__venta__' ? null : items.find((i) => i.id === d.linea_id) || null;
      return {
        negocio_id: orden.negocio_id,
        vendedor_id: orden.vendedor_id,
        orden_id: orden.id,
        orden_item_id: item ? item.id : null,
        producto_id: item?.producto_id ?? null,
        tipo_item: item?.tipo ?? null,
        tipo_venta: venta.tipo_venta,
        tipo_movimiento: 'comision',
        fecha_hecho: orden.created_at,
        base: d.base,
        valor_regla: regla?.valor ?? null,
        participacion: 100,
        comision: d.comision,
        moneda,
        plan_id: planId,
        plan_version: plan.version,
        regla_id: d.regla_id,
        regla_snapshot: regla,
        estado: 'generada',
        idempotency_key: `${orden.id}:${item ? item.id : 'venta'}:${orden.vendedor_id}`,
      };
    });

  if (filas.length === 0) return { generadas: 0, error: null, motivo: 'Esta venta no genera comisión' };

  // 9. Idempotencia a nivel app (sin depender del ON CONFLICT con índice
  //    parcial, que Postgres no acepta como target): miramos qué comisiones ya
  //    existen para esta orden y solo insertamos las que faltan.
  const { data: existentes } = await supabase
    .from('comision_movimientos')
    .select('idempotency_key')
    .eq('orden_id', orden.id)
    .eq('tipo_movimiento', 'comision');
  const yaExisten = new Set((existentes ?? []).map((e: { idempotency_key: string | null }) => e.idempotency_key));
  const nuevas = filas.filter((f) => !yaExisten.has(f.idempotency_key));
  if (nuevas.length === 0) return { generadas: 0, error: null, motivo: 'La comisión de esta venta ya estaba generada' };

  const { data, error } = await supabase.from('comision_movimientos').insert(nuevas).select('id');
  if (error) return { generadas: 0, error: error.message };
  return { generadas: data?.length ?? 0, error: null };
}
