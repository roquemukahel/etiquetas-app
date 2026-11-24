// Generación de comisiones de una venta. Se ejecuta EN EL SERVIDOR (server
// action) — el navegador nunca calcula importes. Es idempotente: correrla dos
// veces sobre la misma venta no duplica movimientos (idempotency_key + upsert).
//
// Este archivo corre en el servidor: no puede usar nada de idioma/React (los mensajes salen en español y la pantalla los traduce).
import { calcularComisionVenta, redondear, type ContextoCategorias, type Regla, type Venta } from './motor';
import { decimalesMoneda } from './tipos';
import { fraccionCobrada, planearPorCobrado, type CuotaCobro } from './cobrado';
import { ESTADOS_COBRADOS } from '../../estadisticas/datos';

export type ResultadoGeneracion = { generadas: number; error: string | null; motivo?: string };

type FilaItem = {
  id: string;
  tipo: string | null;
  producto_id: string | null;
  dispositivo_id: string | null;
  cantidad: number;
  precio_unitario: number;
  costo: number | null;
};

const COLUMNAS_NEGOCIO = 'comisiones_activas, comisiones_desde, comisiones_generar_en, comision_plan_default_id, moneda';
const COLUMNAS_REGLA = 'id, tipo_calculo, valor, alcance, tipo_item, producto_id, prioridad';

const LOTE = 100;
const enTandas = <T,>(lista: T[]): T[][] => {
  const tandas: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE) tandas.push(lista.slice(i, i + LOTE));
  return tandas;
};

// Categoría (y marca) de cada línea, y el árbol de categorías para que una regla de "Accesorios" alcance a "Accesorios › Cables".
// Si algo de esto no se puede leer (por ejemplo el negocio no tiene categorías), las reglas por categoría simplemente no aplican:
// nunca se frena la comisión por eso.
async function categoriasDeLineas(supabase: any, items: FilaItem[]): Promise<{ porItem: Map<string, { categoria_id: string | null; marca: string | null }>; ctx: ContextoCategorias }> {
  const productoIds = Array.from(new Set(items.map((i) => i.producto_id).filter((x): x is string => !!x)));
  const dispositivoIds = Array.from(new Set(items.map((i) => i.dispositivo_id).filter((x): x is string => !!x)));
  const dePro = new Map<string, { categoria_id: string | null; marca: string | null }>();
  const deDisp = new Map<string, string | null>();
  for (const lote of enTandas(productoIds)) {
    const { data, error } = await supabase.from('productos').select('id, categoria_id, marca').in('id', lote);
    if (!error) for (const p of (data ?? []) as { id: string; categoria_id: string | null; marca: string | null }[]) dePro.set(p.id, { categoria_id: p.categoria_id ?? null, marca: p.marca ?? null });
  }
  for (const lote of enTandas(dispositivoIds)) {
    const { data, error } = await supabase.from('dispositivos').select('id, categoria_id').in('id', lote);
    if (!error) for (const d of (data ?? []) as { id: string; categoria_id: string | null }[]) deDisp.set(d.id, d.categoria_id ?? null);
  }
  const porItem = new Map<string, { categoria_id: string | null; marca: string | null }>();
  for (const it of items) {
    if (it.producto_id && dePro.has(it.producto_id)) porItem.set(it.id, dePro.get(it.producto_id)!);
    else if (it.dispositivo_id && deDisp.has(it.dispositivo_id)) porItem.set(it.id, { categoria_id: deDisp.get(it.dispositivo_id) ?? null, marca: null });
  }
  const padres = new Map<string, string | null>();
  const { data: cats, error: eCats } = await supabase.from('stock_categorias').select('id, padre_id');
  if (!eCats) for (const c of (cats ?? []) as { id: string; padre_id: string | null }[]) padres.set(c.id, c.padre_id ?? null);
  return { porItem, ctx: { padreDe: (id) => padres.get(id) ?? null } };
}

// Parte de la venta que ya se cobró (para las ventas financiadas con la comisión "sobre lo cobrado").
async function fraccionDeOrden(supabase: any, orden: any): Promise<{ fraccion: number; error: string | null }> {
  const valorVenta = (orden.total || 0) + (orden.anticipo || 0) + (orden.monto_canje || 0);
  const { data: planes, error } = await supabase.from('financiacion_planes').select('id, importe_financiado, estado').eq('orden_id', orden.id);
  if (error) return { fraccion: 1, error: error.message };
  const vigentes = ((planes ?? []) as { id: string; importe_financiado: number | string | null; estado: string }[]).filter((p) => ['activo', 'completado'].includes(p.estado));
  if (vigentes.length === 0) return { fraccion: 1, error: null };
  const financiado = vigentes.reduce((a, p) => a + (Number(p.importe_financiado) || 0), 0);
  const cuotas: CuotaCobro[] = [];
  for (const lote of enTandas(vigentes.map((p) => p.id))) {
    const { data, error: eCuotas } = await supabase.from('financiacion_cuotas').select('importe_original, importe_pagado, estado').in('plan_id', lote);
    if (eCuotas) return { fraccion: 1, error: eCuotas.message };
    for (const c of (data ?? []) as { importe_original: number | string; importe_pagado: number | string; estado: string }[]) {
      if (c.estado !== 'anulada') cuotas.push({ importe_original: Number(c.importe_original) || 0, importe_pagado: Number(c.importe_pagado) || 0 });
    }
  }
  return { fraccion: fraccionCobrada({ valorVenta, financiado, cuotas }), error: null };
}

type MovExistente = { id: string; orden_item_id: string | null; comision: number; tipo_movimiento: string; estado: string; movimiento_original_id: string | null; created_at: string };

// Reparte una reversión de `monto` entre las comisiones ya generadas de una línea, la más nueva primero, sin pasarse de lo que a cada una le queda
// por revertir (su importe menos lo que ya restaron reversiones anteriores).
export function repartirReversion(existentes: MovExistente[], lineaId: string, monto: number): { originalId: string | null; monto: number }[] {
  const originales = existentes
    .filter((e) => e.orden_item_id === lineaId && e.tipo_movimiento === 'comision' && e.estado !== 'revertida')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const partes: { originalId: string | null; monto: number }[] = [];
  let resto = monto;
  for (const o of originales) {
    if (resto <= 0.00001) break;
    const yaRestado = existentes.filter((r) => r.tipo_movimiento === 'reversion' && r.movimiento_original_id === o.id).reduce((a, r) => a + r.comision, 0);
    const pendiente = Number(o.comision) + yaRestado;
    if (pendiente <= 0.00001) continue;
    const parte = Math.min(pendiente, resto);
    partes.push({ originalId: o.id, monto: redondear(parte, 6) });
    resto -= parte;
  }
  if (resto > 0.00001) partes.push({ originalId: null, monto: redondear(resto, 6) });
  return partes;
}

// Inserta los movimientos. Si el negocio todavía no corrió comisiones_categoria_supabase.sql, las columnas de categoría y marca no
// existen: se reintenta sin ellas para que la comisión se genere igual.
async function insertarMovimientos(supabase: any, filas: Record<string, unknown>[]): Promise<{ generadas: number; error: string | null }> {
  const { data, error } = await supabase.from('comision_movimientos').insert(filas).select('id');
  if (!error) return { generadas: data?.length ?? 0, error: null };
  const sinCategoria = filas.map((f) => {
    const { categoria_id: _c, marca: _m, ...resto } = f;
    return resto;
  });
  const { data: data2, error: error2 } = await supabase.from('comision_movimientos').insert(sinCategoria).select('id');
  if (error2) return { generadas: 0, error: error.message };
  return { generadas: data2?.length ?? 0, error: null };
}

export async function generarComisionesDeOrden(supabase: any, ordenId: string): Promise<ResultadoGeneracion> {
  // 1. Venta + ítems
  const { data: orden, error: eOrden } = await supabase
    .from('ordenes')
    .select(
      'id, negocio_id, vendedor_id, tipo_venta, cuotas, estado, created_at, moneda, total, anticipo, monto_canje, orden_items ( id, tipo, producto_id, dispositivo_id, cantidad, precio_unitario, costo )'
    )
    .eq('id', ordenId)
    .single();
  if (eOrden || !orden) return { generadas: 0, error: eOrden?.message || 'Venta no encontrada' };

  // 2. Config del negocio
  // Cada lectura de acá abajo se chequea: si una falla, NO se puede seguir como si
  // "no hubiera plan / no hubiera reglas" — eso dejaba la venta sin comisión (o con
  // la del plan equivocado) sin ningún aviso. Devolver el error deja que quien llama
  // lo registre y se pueda regenerar después (la generación es idempotente).
  let negocio: any = null;
  let sobreCobrado = false;
  {
    const conOpcion = await supabase.from('negocios').select(COLUMNAS_NEGOCIO + ', comisiones_sobre_cobrado').eq('id', orden.negocio_id).single();
    if (!conOpcion.error) {
      negocio = conOpcion.data;
      sobreCobrado = !!conOpcion.data?.comisiones_sobre_cobrado;
    } else {
      // Sin comisiones_categoria_supabase.sql esa columna no existe: se lee la configuración de siempre.
      const base = await supabase.from('negocios').select(COLUMNAS_NEGOCIO).eq('id', orden.negocio_id).single();
      if (base.error) return { generadas: 0, error: 'No se pudo leer la configuración de comisiones: ' + base.error.message };
      negocio = base.data;
    }
  }
  if (!negocio?.comisiones_activas) return { generadas: 0, error: null, motivo: 'Comisiones desactivadas' };
  if (['cancelado', 'cancelada', 'anulada'].includes(orden.estado)) return { generadas: 0, error: null, motivo: 'La venta está cancelada' };

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
  const { data: asignacion, error: eAsignacion } = await supabase
    .from('comision_plan_vendedores')
    .select('plan_id')
    .eq('vendedor_id', orden.vendedor_id)
    .eq('activo', true)
    .maybeSingle();
  if (eAsignacion) return { generadas: 0, error: 'No se pudo leer el plan del vendedor: ' + eAsignacion.message };
  if (asignacion?.plan_id) planId = asignacion.plan_id;
  if (!planId) return { generadas: 0, error: null, motivo: 'El vendedor no tiene plan de comisión' };

  const { data: plan, error: ePlan } = await supabase.from('comision_planes').select('id, version, activo').eq('id', planId).single();
  if (ePlan) return { generadas: 0, error: 'No se pudo leer el plan de comisión: ' + ePlan.message };
  if (!plan?.activo) return { generadas: 0, error: null, motivo: 'El plan de comisión está inactivo' };

  // Las reglas por categoría (categoria_id, marca) existen solo si el negocio corrió comisiones_categoria_supabase.sql.
  let reglasData: any[] | null = null;
  {
    const conCategoria = await supabase.from('comision_reglas').select(COLUMNAS_REGLA + ', categoria_id, marca').eq('plan_id', planId).eq('activo', true);
    if (!conCategoria.error) reglasData = conCategoria.data;
    else {
      const base = await supabase.from('comision_reglas').select(COLUMNAS_REGLA).eq('plan_id', planId).eq('activo', true);
      if (base.error) return { generadas: 0, error: 'No se pudieron leer las reglas de comisión: ' + base.error.message };
      reglasData = base.data;
    }
  }
  const reglas: Regla[] = (reglasData ?? []) as Regla[];
  if (reglas.length === 0) return { generadas: 0, error: null, motivo: 'El plan no tiene reglas' };

  // 7. Calcular (motor puro)
  const decimales = decimalesMoneda(orden.moneda || negocio.moneda);
  const items: FilaItem[] = orden.orden_items ?? [];
  const { porItem, ctx } = await categoriasDeLineas(supabase, items);
  const venta: Venta = {
    tipo_venta: orden.tipo_venta === 'mayorista' ? 'mayorista' : 'minorista',
    // Mismo criterio que ya usa la UI de Nueva Orden (app/ordenes/nueva/page.tsx):
    // 0 cuotas = contado, 1+ = financiado con recargo.
    es_financiado: (orden.cuotas ?? 0) > 0,
    lineas: items.map((it) => ({
      id: it.id,
      tipo_item: it.tipo || 'producto',
      producto_id: it.producto_id ?? null,
      categoria_id: porItem.get(it.id)?.categoria_id ?? null,
      marca: porItem.get(it.id)?.marca ?? null,
      cantidad: it.cantidad || 0,
      precio_unitario: it.precio_unitario || 0,
      costo_unitario: it.costo ?? null,
    })),
  };
  const res = calcularComisionVenta(venta, reglas, decimales, ctx);

  const moneda = orden.moneda || negocio.moneda || null;
  const filaBase = (item: FilaItem | null) => ({
    negocio_id: orden.negocio_id,
    vendedor_id: orden.vendedor_id,
    orden_id: orden.id,
    orden_item_id: item ? item.id : null,
    producto_id: item?.producto_id ?? null,
    tipo_item: item?.tipo ?? null,
    categoria_id: item ? porItem.get(item.id)?.categoria_id ?? null : null,
    marca: item ? porItem.get(item.id)?.marca ?? null : null,
    tipo_venta: venta.tipo_venta,
    fecha_hecho: orden.created_at,
    participacion: 100,
    moneda,
    plan_id: planId,
    plan_version: plan.version,
  });

  // ---------- Venta financiada con la comisión "sobre lo cobrado" ----------
  // La comisión de cada línea se calcula una sola vez (con las reglas de ese momento: queda guardada en el primer movimiento) y se
  // va generando a medida que se cobra la venta; si un pago se anula, se revierte lo que ya no corresponde.
  if (sobreCobrado && venta.es_financiado) {
    const { fraccion, error: eFraccion } = await fraccionDeOrden(supabase, orden);
    if (eFraccion) return { generadas: 0, error: 'No se pudo calcular lo cobrado de la venta: ' + eFraccion };

    const { data: existentes, error: eExist } = await supabase
      .from('comision_movimientos')
      .select('id, orden_item_id, comision, tipo_movimiento, estado, movimiento_original_id, created_at, regla_snapshot')
      .eq('orden_id', orden.id)
      .in('tipo_movimiento', ['comision', 'reversion']);
    if (eExist) return { generadas: 0, error: 'No se pudieron leer las comisiones ya generadas: ' + eExist.message };
    const movs = (existentes ?? []) as {
      id: string;
      orden_item_id: string | null;
      comision: number;
      tipo_movimiento: string;
      estado: string;
      movimiento_original_id: string | null;
      created_at: string;
      regla_snapshot: any;
    }[];

    const lineas: { lineaId: string; comisionTotal: number; baseTotal: number; regla: any }[] = [];
    for (const d of res.detalle) {
      if (!d.regla_id || d.linea_id === '__venta__') continue;
      const previos = movs.filter((m) => m.orden_item_id === d.linea_id);
      const conTotales = previos.find((m) => m.regla_snapshot && m.regla_snapshot.comision_total != null);
      if (previos.length > 0 && !conTotales) continue; // generada de una sola vez antes: no se toca
      if (conTotales) {
        lineas.push({ lineaId: d.linea_id, comisionTotal: Number(conTotales.regla_snapshot.comision_total) || 0, baseTotal: Number(conTotales.regla_snapshot.base_total) || 0, regla: conTotales.regla_snapshot });
      } else if (d.comision !== 0) {
        lineas.push({ lineaId: d.linea_id, comisionTotal: d.comision, baseTotal: d.base, regla: reglas.find((r) => r.id === d.regla_id) ?? null });
      }
    }
    const planeado = planearPorCobrado({
      lineas: lineas.map((l) => ({ lineaId: l.lineaId, comisionTotal: l.comisionTotal, baseTotal: l.baseTotal })),
      fraccion,
      existentes: movs.map((m) => ({ orden_item_id: m.orden_item_id, comision: Number(m.comision) || 0 })),
      claveBase: (lineaId) => `${orden.id}:${lineaId}:${orden.vendedor_id}`,
      decimales,
    });
    if (planeado.length === 0) {
      return { generadas: 0, error: null, motivo: movs.length === 0 ? 'La comisión se genera a medida que se cobran las cuotas' : 'La comisión de esta venta ya estaba generada' };
    }
    const filasCobrado = planeado.flatMap((p): Record<string, unknown>[] => {
      const linea = lineas.find((l) => l.lineaId === p.lineaId)!;
      const item = items.find((i) => i.id === p.lineaId) ?? null;
      const reglaGuardada = linea.regla ? { ...linea.regla, comision_total: linea.comisionTotal, base_total: linea.baseTotal } : null;
      const comunes = {
        ...filaBase(item),
        valor_regla: linea.regla?.valor ?? null,
        regla_id: linea.regla?.id ?? null,
        regla_snapshot: reglaGuardada,
        estado: 'generada',
      };
      if (p.tipo === 'comision') return [{ ...comunes, tipo_movimiento: 'comision', base: p.base, comision: p.comision, motivo: null, idempotency_key: p.idempotencyKey }];
      // Reversión por un pago anulado o corregido: se reparte entre las comisiones ya generadas de la línea (la más nueva primero) y
      // cada parte queda ligada a la suya, así cancelar la venta después revierte solo lo que todavía queda (comision_revertir_orden).
      const partes = repartirReversion(movs, p.lineaId, Math.abs(p.comision));
      return partes.map((parte) => ({
        ...comunes,
        tipo_movimiento: 'reversion',
        base: redondear((p.base * parte.monto) / Math.abs(p.comision), decimales),
        comision: -parte.monto,
        movimiento_original_id: parte.originalId,
        motivo: 'Se cobró menos de lo que ya se había comisionado (pago anulado o corregido)',
        idempotency_key: null,
      }));
    });
    return insertarMovimientos(supabase, filasCobrado);
  }

  // ---------- Comisión de una sola vez (lo de siempre) ----------
  // 8. Armar movimientos (una comisión por línea con comisión != 0). Snapshot
  //    de la regla aplicada, para que editar la regla NO cambie el histórico.
  const filas = res.detalle
    .filter((d) => d.comision !== 0 && d.regla_id)
    .map((d) => {
      const regla = reglas.find((r) => r.id === d.regla_id) || null;
      const item = d.linea_id === '__venta__' ? null : items.find((i) => i.id === d.linea_id) || null;
      return {
        ...filaBase(item),
        tipo_movimiento: 'comision',
        base: d.base,
        valor_regla: regla?.valor ?? null,
        comision: d.comision,
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
  const { data: existentes, error: eExistentes } = await supabase
    .from('comision_movimientos')
    .select('idempotency_key')
    .eq('orden_id', orden.id)
    .eq('tipo_movimiento', 'comision');
  if (eExistentes) return { generadas: 0, error: 'No se pudieron leer las comisiones ya generadas: ' + eExistentes.message };
  const yaExisten = new Set((existentes ?? []).map((e: { idempotency_key: string | null }) => e.idempotency_key));
  const nuevas = filas.filter((f) => !yaExisten.has(f.idempotency_key));
  if (nuevas.length === 0) return { generadas: 0, error: null, motivo: 'La comisión de esta venta ya estaba generada' };

  return insertarMovimientos(supabase, nuevas);
}

// Después de cobrar (o de anular/corregir un pago) a un cliente: ajusta las comisiones de sus ventas financiadas a lo que se cobró.
// Solo hace algo si el negocio eligió generar la comisión "sobre lo cobrado".
export async function reconciliarComisionesDeCliente(supabase: any, clienteId: string): Promise<{ ordenes: number; generadas: number; error: string | null }> {
  const { data: planes, error } = await supabase.from('financiacion_planes').select('orden_id, negocio_id').eq('cliente_id', clienteId).not('orden_id', 'is', null);
  if (error) return { ordenes: 0, generadas: 0, error: error.message };
  const filas = (planes ?? []) as { orden_id: string; negocio_id: string }[];
  if (filas.length === 0) return { ordenes: 0, generadas: 0, error: null };
  const { data: neg, error: eNeg } = await supabase.from('negocios').select('comisiones_activas, comisiones_sobre_cobrado').eq('id', filas[0].negocio_id).single();
  // Sin la opción (o sin el SQL que la crea) no hay nada que ajustar.
  if (eNeg || !neg?.comisiones_activas || !neg?.comisiones_sobre_cobrado) return { ordenes: 0, generadas: 0, error: null };
  const ordenes = Array.from(new Set(filas.map((f) => f.orden_id))).slice(0, 60);
  let generadas = 0;
  let primerError: string | null = null;
  for (const id of ordenes) {
    const r = await generarComisionesDeOrden(supabase, id);
    generadas += r.generadas;
    if (r.error && !primerError) primerError = r.error;
  }
  return { ordenes: ordenes.length, generadas, error: primerError };
}
