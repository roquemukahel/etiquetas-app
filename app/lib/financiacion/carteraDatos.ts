import type { SupabaseClient } from '@supabase/supabase-js';
import { enLotes, obtenerTodasLasFilas } from '../db';
import { calcularPlan, type CuotaIn, type InfoPlanIn, type PagoIn, type PlanCartera, type PlanIn } from './cartera';

// Trae de Supabase todo lo que hace falta para armar la cartera de financiación y lo pasa por
// calcularPlan (cartera.ts). Las consultas por lista de ids van en lotes de 100 (largo de URL)
// y de a pocas a la vez, para no saturar la base.
export type CarteraCargada = {
  planes: PlanCartera[];
  nombresClientes: Map<string, string>;
  // Todas las órdenes que originaron un crédito de cuotas propias (de cualquier estado), para
  // separar las ventas financiadas de las de pago exclusivo.
  ordenesConPlan: Set<string>;
  moneda: string;
  // Créditos en otra moneda (no se mezclan con la principal).
  otrasMonedas: number;
};

async function enParalelo<T, R>(items: T[], tarea: (x: T) => Promise<R>, simultaneas = 4): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += simultaneas) {
    salida.push(...(await Promise.all(items.slice(i, i + simultaneas).map(tarea))));
  }
  return salida;
}

export async function cargarCartera(supabase: SupabaseClient, nombreCategoria: (id: string | null) => string): Promise<CarteraCargada> {
  const [planesRaw, cuotasRaw, pagosRaw] = await Promise.all([
    obtenerTodasLasFilas<PlanIn>(
      supabase,
      'financiacion_planes',
      'id, cliente_id, orden_id, moneda, importe_financiado, entrega_inicial, cantidad_cuotas, estado, created_at'
    ),
    obtenerTodasLasFilas<CuotaIn>(supabase, 'financiacion_cuotas', 'plan_id, fecha_vencimiento, importe_original, importe_pagado, estado'),
    obtenerTodasLasFilas<any>(
      supabase,
      'financiacion_pagos',
      'monto_aplicado, tipo, pagos!inner(fecha, anulado), financiacion_cuotas!inner(plan_id)',
      [],
      (q) => q.eq('tipo', 'pago')
    ),
  ]);

  // Moneda principal: la de la mayoría de los créditos.
  const porMoneda = new Map<string, number>();
  for (const p of planesRaw) porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? 0) + 1);
  const moneda = Array.from(porMoneda.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ARS';
  const planesIn = planesRaw.filter((p) => p.moneda === moneda);
  const ordenesConPlan = new Set(planesRaw.map((p) => p.orden_id).filter((x): x is string => !!x));

  const idsOrdenes = Array.from(new Set(planesIn.map((p) => p.orden_id).filter((x): x is string => !!x)));
  const idsClientes = Array.from(new Set(planesIn.map((p) => p.cliente_id)));

  type ItemF = { orden_id: string; cantidad: number; costo: number | null; producto_id: string | null; dispositivo_id: string | null };
  const items: ItemF[] = [];
  const sucursalPorOrden = new Map<string, string | null>();
  const cobradoInicialPorOrden = new Map<string, number>();
  const clientes = new Map<string, { nombre: string; localidad: string | null }>();

  await Promise.all([
    enParalelo(enLotes(idsOrdenes), async (lote) => {
      const [it, ord, pg] = await Promise.all([
        supabase.from('orden_items').select('orden_id, cantidad, costo, producto_id, dispositivo_id').in('orden_id', lote),
        supabase.from('ordenes').select('id, sucursal_id').in('id', lote),
        supabase.from('pagos').select('orden_id, monto').in('orden_id', lote).eq('anulado', false),
      ]);
      items.push(...((it.data as ItemF[]) ?? []));
      for (const o of (ord.data as { id: string; sucursal_id: string | null }[]) ?? []) sucursalPorOrden.set(o.id, o.sucursal_id);
      for (const p of (pg.data as { orden_id: string; monto: number }[]) ?? []) {
        cobradoInicialPorOrden.set(p.orden_id, (cobradoInicialPorOrden.get(p.orden_id) ?? 0) + (p.monto || 0));
      }
    }),
    enParalelo(enLotes(idsClientes), async (lote) => {
      const { data, error } = await supabase.from('clientes').select('id, nombre, apellido, localidad').in('id', lote);
      if (error) throw error;
      for (const c of (data as { id: string; nombre: string; apellido: string | null; localidad: string | null }[]) ?? []) {
        clientes.set(c.id, { nombre: `${c.nombre} ${c.apellido ?? ''}`.trim(), localidad: c.localidad });
      }
    }),
  ]);

  // Categoría (rubro) de cada ítem: la del producto / equipo vendido.
  const categoriaDeProducto = new Map<string, string | null>();
  const categoriaDeEquipo = new Map<string, string | null>();
  await Promise.all([
    enParalelo(enLotes(Array.from(new Set(items.map((i) => i.producto_id).filter((x): x is string => !!x)))), async (lote) => {
      const { data, error } = await supabase.from('productos').select('id, categoria_id').in('id', lote);
      if (error) throw error;
      for (const f of (data as { id: string; categoria_id: string | null }[]) ?? []) categoriaDeProducto.set(f.id, f.categoria_id);
    }),
    enParalelo(enLotes(Array.from(new Set(items.map((i) => i.dispositivo_id).filter((x): x is string => !!x)))), async (lote) => {
      const { data, error } = await supabase.from('dispositivos').select('id, categoria_id').in('id', lote);
      if (error) throw error;
      for (const f of (data as { id: string; categoria_id: string | null }[]) ?? []) categoriaDeEquipo.set(f.id, f.categoria_id);
    }),
  ]);

  const itemsPorOrden = new Map<string, ItemF[]>();
  for (const it of items) itemsPorOrden.set(it.orden_id, [...(itemsPorOrden.get(it.orden_id) ?? []), it]);
  const cuotasPorPlan = new Map<string, CuotaIn[]>();
  for (const c of cuotasRaw) cuotasPorPlan.set(c.plan_id, [...(cuotasPorPlan.get(c.plan_id) ?? []), c]);
  const pagosPorPlan = new Map<string, PagoIn[]>();
  for (const p of pagosRaw) {
    if (p.pagos?.anulado) continue;
    const planId = p.financiacion_cuotas?.plan_id;
    if (!planId || !p.pagos?.fecha) continue;
    pagosPorPlan.set(planId, [...(pagosPorPlan.get(planId) ?? []), { plan_id: planId, monto: Number(p.monto_aplicado) || 0, fecha: p.pagos.fecha }]);
  }

  const planes = planesIn.map((p) => {
    const its = p.orden_id ? itemsPorOrden.get(p.orden_id) ?? [] : [];
    const categorias = Array.from(
      new Set(
        its.map((i) => {
          const cat = i.producto_id ? categoriaDeProducto.get(i.producto_id) : i.dispositivo_id ? categoriaDeEquipo.get(i.dispositivo_id) : null;
          return nombreCategoria(cat ?? null);
        })
      )
    );
    const info: InfoPlanIn = {
      costo: its.reduce((a, i) => a + (i.costo ?? 0) * (i.cantidad || 0), 0),
      costoCompleto: its.length > 0 && its.every((i) => i.costo != null),
      cobradoInicial: p.orden_id ? cobradoInicialPorOrden.get(p.orden_id) ?? 0 : 0,
      sucursal_id: p.orden_id ? sucursalPorOrden.get(p.orden_id) ?? null : null,
      categorias,
      localidad: clientes.get(p.cliente_id)?.localidad ?? null,
    };
    return calcularPlan(p, cuotasPorPlan.get(p.id) ?? [], pagosPorPlan.get(p.id) ?? [], info);
  });

  return {
    planes,
    nombresClientes: new Map(Array.from(clientes.entries()).map(([id, c]) => [id, c.nombre])),
    ordenesConPlan,
    moneda,
    otrasMonedas: planesRaw.length - planesIn.length,
  };
}
