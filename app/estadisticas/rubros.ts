// ============================================================
// Inversión e inventario por RUBRO (categorías del Stock) — capa PURA.
//
// Cuánto se compró por rubro, cuánto vale el inventario a costo, cuánto se
// recuperó con las ventas, cuántos días de stock quedan y qué rubros se están
// agotando. Recibe filas ya traídas; no toca Supabase.
// ============================================================

export const SIN_RUBRO = 'Sin categoría';

export type CompraRubroR = {
  categoria_id: string | null;
  monto: number;
  proveedor_id: string | null;
  sucursal_id: string | null;
  fecha: string;
};

export type StockRubroR = {
  categoria_id: string | null;
  sucursal_id: string | null;
  unidades: number;
  costo_unitario: number | null;
};

// Una línea vendida (dispositivo/producto) ya clasificada por rubro. Es la misma
// forma que arma Estadísticas para el ranking de categorías (ItemProductoR).
export type VentaRubroR = { categoriaNombre: string; cantidad: number; precio_unitario: number; costo: number | null };

export type FilaCompraRubro = { rubro: string; monto: number };

export function comprasPorRubro(
  compras: CompraRubroR[],
  nombreDe: (categoriaId: string | null) => string,
  desde: Date,
  hasta: Date,
  filtros: { proveedorId?: string; sucursalId?: string | null } = {}
): FilaCompraRubro[] {
  const mapa = new Map<string, number>();
  for (const c of compras) {
    const f = new Date(c.fecha);
    if (f < desde || f > hasta) continue;
    if (filtros.proveedorId && c.proveedor_id !== filtros.proveedorId) continue;
    if (filtros.sucursalId && c.sucursal_id !== filtros.sucursalId) continue;
    const rubro = nombreDe(c.categoria_id);
    mapa.set(rubro, (mapa.get(rubro) ?? 0) + (c.monto || 0));
  }
  return Array.from(mapa.entries())
    .map(([rubro, monto]) => ({ rubro, monto }))
    .filter((f) => f.monto > 0)
    .sort((a, b) => b.monto - a.monto);
}

export type FilaInventarioRubro = {
  rubro: string;
  unidades: number;
  costoTotal: number;
  // Unidades en stock que no tienen costo cargado (no valen $0: no se sabe lo que valen).
  unidadesSinCosto: number;
  pctSinCosto: number;
  porSucursal: Record<string, { unidades: number; costoTotal: number }>;
};

export function inventarioPorRubro(
  stock: StockRubroR[],
  nombreDe: (categoriaId: string | null) => string,
  sucursalId: string | null = null
): FilaInventarioRubro[] {
  const mapa = new Map<string, FilaInventarioRubro>();
  for (const s of stock) {
    if (s.unidades <= 0) continue;
    if (sucursalId && s.sucursal_id !== sucursalId) continue;
    const rubro = nombreDe(s.categoria_id);
    const fila = mapa.get(rubro) ?? { rubro, unidades: 0, costoTotal: 0, unidadesSinCosto: 0, pctSinCosto: 0, porSucursal: {} };
    fila.unidades += s.unidades;
    if (s.costo_unitario == null) fila.unidadesSinCosto += s.unidades;
    else fila.costoTotal += s.costo_unitario * s.unidades;
    const clave = s.sucursal_id ?? '';
    const suc = fila.porSucursal[clave] ?? { unidades: 0, costoTotal: 0 };
    suc.unidades += s.unidades;
    if (s.costo_unitario != null) suc.costoTotal += s.costo_unitario * s.unidades;
    fila.porSucursal[clave] = suc;
    mapa.set(rubro, fila);
  }
  return Array.from(mapa.values())
    .map((f) => ({ ...f, pctSinCosto: f.unidades > 0 ? (f.unidadesSinCosto / f.unidades) * 100 : 0 }))
    .sort((a, b) => b.costoTotal - a.costoTotal);
}

export function totalInventario(filas: FilaInventarioRubro[]) {
  const unidades = filas.reduce((a, f) => a + f.unidades, 0);
  const sinCosto = filas.reduce((a, f) => a + f.unidadesSinCosto, 0);
  return {
    unidades,
    costoTotal: filas.reduce((a, f) => a + f.costoTotal, 0),
    unidadesSinCosto: sinCosto,
    pctSinCosto: unidades > 0 ? (sinCosto / unidades) * 100 : 0,
  };
}

export type AlertaRubro = 'agotado' | 'por_agotarse' | null;

export type FilaRecupero = {
  rubro: string;
  comprado: number;
  ventas: number;
  costoVendido: number;
  // Ventas menos costo, SOLO sobre lo que tiene costo cargado.
  margen: number;
  ventasConCosto: number;
  unidadesVendidas: number;
  stockCosto: number;
  unidadesStock: number;
  // Ventas del período ÷ comprado en el período (null si no se compró nada).
  pctRecuperado: number | null;
  // Cuántos días alcanza el stock actual al ritmo de venta del período (a costo).
  diasDeStock: number | null;
  // Cuántos días alcanzan las unidades en stock al ritmo de venta (unidades).
  coberturaDias: number | null;
  alerta: AlertaRubro;
};

export const UMBRAL_POR_AGOTARSE_DIAS = 7;

export function recuperoPorRubro(params: {
  compras: FilaCompraRubro[];
  ventas: VentaRubroR[];
  // Servicio técnico: no tiene stock ni compras, pero sí ventas y ganancia bruta.
  taller?: { ventas: number; ventasConCosto: number; ganancia: number; unidades?: number } | null;
  inventario: FilaInventarioRubro[];
  dias: number;
}): FilaRecupero[] {
  const dias = Math.max(1, params.dias);
  type Acc = { comprado: number; ventas: number; costoVendido: number; ventasConCosto: number; unidades: number; stockCosto: number; unidadesStock: number };
  const mapa = new Map<string, Acc>();
  const get = (rubro: string): Acc => {
    let a = mapa.get(rubro);
    if (!a) {
      a = { comprado: 0, ventas: 0, costoVendido: 0, ventasConCosto: 0, unidades: 0, stockCosto: 0, unidadesStock: 0 };
      mapa.set(rubro, a);
    }
    return a;
  };
  for (const c of params.compras) get(c.rubro).comprado += c.monto;
  for (const v of params.ventas) {
    const a = get(v.categoriaNombre);
    a.ventas += v.precio_unitario * v.cantidad;
    a.unidades += v.cantidad;
    if (v.costo != null) {
      a.costoVendido += v.costo * v.cantidad;
      a.ventasConCosto += v.precio_unitario * v.cantidad;
    }
  }
  for (const i of params.inventario) {
    const a = get(i.rubro);
    a.stockCosto += i.costoTotal;
    a.unidadesStock += i.unidades;
  }
  if (params.taller && params.taller.ventas > 0) {
    const a = get('Servicio técnico');
    a.ventas += params.taller.ventas;
    a.ventasConCosto += params.taller.ventasConCosto;
    a.costoVendido += params.taller.ventasConCosto - params.taller.ganancia;
    a.unidades += params.taller.unidades ?? 0;
  }

  return Array.from(mapa.entries())
    .map(([rubro, a]) => {
      const costoPorDia = a.costoVendido / dias;
      const unidadesPorDia = a.unidades / dias;
      const coberturaDias = unidadesPorDia > 0 ? a.unidadesStock / unidadesPorDia : null;
      let alerta: AlertaRubro = null;
      if (rubro !== 'Servicio técnico' && a.unidades > 0) {
        if (a.unidadesStock === 0) alerta = 'agotado';
        else if (coberturaDias != null && coberturaDias < UMBRAL_POR_AGOTARSE_DIAS) alerta = 'por_agotarse';
      }
      return {
        rubro,
        comprado: a.comprado,
        ventas: a.ventas,
        costoVendido: a.costoVendido,
        margen: a.ventasConCosto - a.costoVendido,
        ventasConCosto: a.ventasConCosto,
        unidadesVendidas: a.unidades,
        stockCosto: a.stockCosto,
        unidadesStock: a.unidadesStock,
        pctRecuperado: a.comprado > 0.009 ? (a.ventas / a.comprado) * 100 : null,
        diasDeStock: costoPorDia > 0 && a.stockCosto > 0 ? a.stockCosto / costoPorDia : null,
        coberturaDias,
        alerta,
      };
    })
    .filter((f) => f.comprado > 0 || f.ventas > 0 || f.unidadesStock > 0)
    .sort((a, b) => b.ventas - a.ventas || b.comprado - a.comprado);
}
