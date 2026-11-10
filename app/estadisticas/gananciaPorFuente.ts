import { entre, ESTADOS_COBRADOS, esLineaDeTaller, montoVenta, type ItemR, type OrdenR, type PagoR } from './datos';
import { repartirVenta, type CargoVentaR, type PagoCuotaR, type PlanVentaR } from './ventasPorForma';

// "Ganancia por fuente": de dónde sale la plata del negocio. Cada venta cobrada del período se reparte entre cuatro fuentes:
//   - Venta de productos: lo que se cobró al contado o con tarjeta de las líneas de producto/equipo.
//   - Créditos propios: la parte de esas líneas que quedó en un plan de cuotas.
//   - Fiado / cuenta corriente: la parte que quedó en la cuenta corriente del cliente.
//   - Servicio técnico: las líneas de taller (mano de obra y repuestos de una reparación), sea cual sea la forma de cobro.
// El reparto usa las mismas partes que "Ventas según cómo se cobran" (repartirVenta), así que el facturado de las cuatro fuentes suma
// exactamente las ventas netas del período. El costo y la ganancia salen de las líneas que tienen costo cargado (igual que en el resto
// de Estadísticas): una línea sin costo no inventa ganancia.

export type FuenteGanancia = 'productos' | 'creditos' | 'fiado' | 'servicio';
export const FUENTES: FuenteGanancia[] = ['productos', 'creditos', 'fiado', 'servicio'];

export type FilaFuente = {
  facturado: number;
  costo: number;
  // Ganancia generada por las ventas del período (en un crédito, la de toda la venta aunque la plata entre en cuotas).
  ganancia: number;
  // Plata que entró en el período por esta fuente.
  cobrado: number;
  // Parte de la ganancia que ya se cobró. En créditos: de las cuotas cobradas en el período. En fiado no se puede atribuir a una venta (null).
  gananciaCobrada: number | null;
};

export type GananciaPorFuente = Record<FuenteGanancia, FilaFuente> & { total: FilaFuente };

export type PagoCuotaConOrden = PagoCuotaR & { orden_id: string | null };

const aNumero = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ESTADOS_PLAN_VIGENTE = ['activo', 'completado'];
const MEDIOS_TARJETA = ['debito', 'credito', 'débito', 'crédito'];

function vacia(): FilaFuente {
  return { facturado: 0, costo: 0, ganancia: 0, cobrado: 0, gananciaCobrada: 0 };
}

function sumarPorOrden<T>(filas: T[], ordenDe: (f: T) => string | null | undefined, montoDe: (f: T) => number, vale: (f: T) => boolean): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const id = ordenDe(f);
    if (!id || !vale(f)) continue;
    mapa.set(id, (mapa.get(id) ?? 0) + montoDe(f));
  }
  return mapa;
}

type LineaTipada = ItemR & { tipo?: string | null };

// Valor, costo y ganancia de un conjunto de líneas (solo las que tienen costo aportan costo y ganancia).
function totalesDeLineas(items: LineaTipada[]): { valor: number; costo: number; ganancia: number } {
  let valor = 0;
  let costo = 0;
  let ganancia = 0;
  for (const it of items) {
    const cant = it.cantidad || 0;
    const precio = it.precio_unitario ?? 0;
    valor += precio * cant;
    const c = it.costo != null ? it.costo : it.tipo === 'trabajo' ? 0 : null; // misma regla que costoDeLinea
    if (c != null && it.precio_unitario != null) {
      costo += c * cant;
      ganancia += (precio - c) * cant;
    }
  }
  return { valor, costo, ganancia };
}

export function gananciaPorFuente(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, LineaTipada[]>,
  planes: PlanVentaR[],
  cargosVenta: CargoVentaR[],
  pagos: PagoR[],
  pagosDeCuotas: PagoCuotaConOrden[],
  cobranzasCartera: number,
  desde: Date,
  hasta: Date
): GananciaPorFuente {
  const financiadoPorOrden = sumarPorOrden(planes, (p) => p.orden_id, (p) => aNumero(p.importe_financiado), (p) => ESTADOS_PLAN_VIGENTE.includes(p.estado));
  const ctaCtePorOrden = sumarPorOrden(cargosVenta, (c) => c.orden_id, (c) => aNumero(c.monto), (c) => c.tipo === 'cargo' && c.concepto === 'venta');
  const tarjetaPorOrden = sumarPorOrden(pagos, (p) => p.orden_id, (p) => aNumero(p.monto), (p) => MEDIOS_TARJETA.includes(p.medio));
  const cuotasPeriodoPorOrden = sumarPorOrden(pagosDeCuotas, (p) => p.orden_id, (p) => aNumero(p.monto_aplicado), (p) => entre(p.created_at, desde, hasta));

  const r: GananciaPorFuente = { productos: vacia(), creditos: vacia(), fiado: vacia(), servicio: vacia(), total: vacia() };
  r.fiado.gananciaCobrada = null;

  // Ganancia de crédito de cada venta financiada (de cualquier fecha) para repartir lo cobrado en cuotas del período.
  let gananciaCreditoCobrada = 0;

  for (const o of ordenes) {
    if (!ESTADOS_COBRADOS.includes(o.estado)) continue;
    const items = itemsPorOrden.get(o.id) ?? [];
    const taller = items.filter((it) => esLineaDeTaller(it.tipo));
    const producto = items.filter((it) => !esLineaDeTaller(it.tipo));
    const tp = totalesDeLineas(producto);
    const ts = totalesDeLineas(taller);
    const lineas = tp.valor + ts.valor;
    const valor = montoVenta(o);
    const parteProducto = lineas > 0 ? tp.valor / lineas : 1; // qué parte del valor de la venta es producto (el resto es taller)
    const partes = repartirVenta(valor, financiadoPorOrden.get(o.id) ?? 0, ctaCtePorOrden.get(o.id) ?? 0, tarjetaPorOrden.get(o.id) ?? 0);
    const enPeriodo = entre(o.created_at, desde, hasta);

    // Una venta financiada de un período anterior igual cobra cuotas en este: la ganancia cobrada de créditos mira todas las ventas.
    if (valor > 0 && partes.financiado > 0) {
      const gananciaCredito = (tp.ganancia * partes.financiado) / valor;
      const financiado = financiadoPorOrden.get(o.id) ?? 0;
      const cuotas = cuotasPeriodoPorOrden.get(o.id) ?? 0;
      if (financiado > 0 && gananciaCredito !== 0) gananciaCreditoCobrada += gananciaCredito * Math.min(1, cuotas / financiado);
    }

    if (!enPeriodo || valor <= 0) continue;

    const contadoTarjeta = partes.contado + partes.tarjeta;
    const reparto: [FuenteGanancia, number][] = [
      ['productos', contadoTarjeta],
      ['creditos', partes.financiado],
      ['fiado', partes.cuentaCorriente],
    ];
    for (const [fuente, parte] of reparto) {
      const f = parte / valor;
      const fila = r[fuente];
      fila.facturado += valor * parteProducto * f;
      fila.costo += tp.costo * f;
      fila.ganancia += tp.ganancia * f;
    }
    // Servicio técnico: las líneas de taller completas, cualquiera sea la forma de cobro.
    r.servicio.facturado += valor * (1 - parteProducto);
    r.servicio.costo += ts.costo;
    r.servicio.ganancia += ts.ganancia;
  }

  // Cobrado en el período: lo vendido al contado/tarjeta y el servicio técnico entran al venderse; los créditos, por las cuotas que se
  // cobraron en el período; el fiado, por las cobranzas de cuenta corriente que no fueron cuotas.
  r.productos.cobrado = r.productos.facturado;
  r.productos.gananciaCobrada = r.productos.ganancia;
  r.servicio.cobrado = r.servicio.facturado;
  r.servicio.gananciaCobrada = r.servicio.ganancia;
  const cuotasCobradas = pagosDeCuotas.filter((p) => entre(p.created_at, desde, hasta)).reduce((a, p) => a + aNumero(p.monto_aplicado), 0);
  r.creditos.cobrado = cuotasCobradas;
  r.creditos.gananciaCobrada = gananciaCreditoCobrada;
  r.fiado.cobrado = Math.max(0, cobranzasCartera - cuotasCobradas);

  for (const f of FUENTES) {
    r.total.facturado += r[f].facturado;
    r.total.costo += r[f].costo;
    r.total.ganancia += r[f].ganancia;
    r.total.cobrado += r[f].cobrado;
    r.total.gananciaCobrada = (r.total.gananciaCobrada ?? 0) + (r[f].gananciaCobrada ?? 0);
  }
  return r;
}

// Últimos 12 meses (el mes de `hasta` y los 11 anteriores), uno por uno, para el gráfico.
export type MesFuente = { clave: string; etiqueta: string; ganancia: Record<FuenteGanancia, number>; total: number };

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function gananciaPorFuenteMensual(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, LineaTipada[]>,
  planes: PlanVentaR[],
  cargosVenta: CargoVentaR[],
  pagos: PagoR[],
  pagosDeCuotas: PagoCuotaConOrden[],
  hasta: Date
): MesFuente[] {
  const out: MesFuente[] = [];
  for (let i = 11; i >= 0; i--) {
    const inicio = new Date(hasta.getFullYear(), hasta.getMonth() - i, 1, 0, 0, 0, 0);
    const fin = new Date(hasta.getFullYear(), hasta.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const g = gananciaPorFuente(ordenes, itemsPorOrden, planes, cargosVenta, pagos, pagosDeCuotas, 0, inicio, fin);
    out.push({
      clave: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: `${MESES_CORTOS[inicio.getMonth()]}${inicio.getMonth() === 0 ? ` ${String(inicio.getFullYear()).slice(2)}` : ''}`,
      ganancia: { productos: g.productos.ganancia, creditos: g.creditos.ganancia, fiado: g.fiado.ganancia, servicio: g.servicio.ganancia },
      total: g.total.ganancia,
    });
  }
  return out;
}
