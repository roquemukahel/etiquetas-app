import { costoDeLinea, entre, esDineroIngresado, ESTADOS_COBRADOS, montoVenta, type ItemR, type OrdenR, type PagoR } from './datos';

// Ventas y ganancia según CÓMO se cobran: al contado, con tarjeta, financiadas en cuotas propias o a cuenta corriente (fiado).
// Reclamo real de un cliente: "Vendido a crédito" solo tomaba la cuenta corriente sin cuotas y las ventas financiadas en cuotas
// quedaban dentro de "Vendido al contado"; además la ganancia de una venta financiada se contaba entera el día de la venta aunque la
// plata entre en cuotas. Todo sale de la orden: cuánto de su valor quedó en un plan de cuotas, cuánto en cuenta corriente, cuánto
// se pagó con tarjeta, y el resto es contado. Las cuatro partes suman exactamente el valor de la venta.

export type PlanVentaR = { orden_id?: string | null; importe_financiado: number | string | null; estado: string };
export type CargoVentaR = { orden_id?: string | null; tipo: string; concepto: string; monto: number | string | null };
export type PagoCuotaR = { orden_id: string | null; monto_aplicado: number | string | null; created_at: string };

export type PartesDeVenta = { contado: number; tarjeta: number; financiado: number; cuentaCorriente: number };

// Un plan reprogramado o anulado fue reemplazado o cancelado: solo cuentan los vigentes.
const ESTADOS_PLAN_VIGENTE = ['activo', 'completado'];
const MEDIOS_TARJETA = ['debito', 'credito', 'débito', 'crédito'];

const aNumero = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function sumarPorOrden<T>(filas: T[], ordenDe: (f: T) => string | null | undefined, montoDe: (f: T) => number, vale: (f: T) => boolean): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const id = ordenDe(f);
    if (!id || !vale(f)) continue;
    mapa.set(id, (mapa.get(id) ?? 0) + montoDe(f));
  }
  return mapa;
}

// Reparte el valor de una venta en sus cuatro partes, sin que ninguna pase de lo que queda y sin que la suma se desvíe del valor.
export function repartirVenta(valor: number, financiado: number, cuentaCorriente: number, tarjeta: number): PartesDeVenta {
  const v = Math.max(0, valor);
  const f = Math.min(v, Math.max(0, financiado));
  const cc = Math.min(v - f, Math.max(0, cuentaCorriente));
  const tj = Math.min(v - f - cc, Math.max(0, tarjeta));
  return { financiado: f, cuentaCorriente: cc, tarjeta: tj, contado: v - f - cc - tj };
}

export type DesgloseVentas = {
  ventas: PartesDeVenta & { total: number };
  // Ganancia bruta del período según cómo se cobra la venta (la tarjeta cuenta como contado: la plata entra al cobrar).
  ganancia: { contado: number; financiado: number; cuentaCorriente: number; total: number };
};

export function desgloseDeVentas(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, ItemR[]>,
  planes: PlanVentaR[],
  cargosVenta: CargoVentaR[],
  pagos: PagoR[],
  desde: Date,
  hasta: Date
): DesgloseVentas {
  const financiadoPorOrden = sumarPorOrden(planes, (p) => p.orden_id, (p) => aNumero(p.importe_financiado), (p) => ESTADOS_PLAN_VIGENTE.includes(p.estado));
  const ctaCtePorOrden = sumarPorOrden(cargosVenta, (c) => c.orden_id, (c) => aNumero(c.monto), (c) => c.tipo === 'cargo' && c.concepto === 'venta');
  const tarjetaPorOrden = sumarPorOrden(pagos, (p) => p.orden_id, (p) => aNumero(p.monto), (p) => MEDIOS_TARJETA.includes(p.medio));

  const r: DesgloseVentas = {
    ventas: { contado: 0, tarjeta: 0, financiado: 0, cuentaCorriente: 0, total: 0 },
    ganancia: { contado: 0, financiado: 0, cuentaCorriente: 0, total: 0 },
  };
  for (const o of ordenes) {
    if (!ESTADOS_COBRADOS.includes(o.estado) || !entre(o.created_at, desde, hasta)) continue;
    const valor = montoVenta(o);
    const partes = repartirVenta(valor, financiadoPorOrden.get(o.id) ?? 0, ctaCtePorOrden.get(o.id) ?? 0, tarjetaPorOrden.get(o.id) ?? 0);
    r.ventas.contado += partes.contado;
    r.ventas.tarjeta += partes.tarjeta;
    r.ventas.financiado += partes.financiado;
    r.ventas.cuentaCorriente += partes.cuentaCorriente;
    r.ventas.total += valor > 0 ? valor : 0;

    const g = gananciaDeOrden(itemsPorOrden.get(o.id) ?? []);
    if (g !== 0 && valor > 0) {
      r.ganancia.contado += (g * (partes.contado + partes.tarjeta)) / valor;
      r.ganancia.financiado += (g * partes.financiado) / valor;
      r.ganancia.cuentaCorriente += (g * partes.cuentaCorriente) / valor;
    }
    r.ganancia.total += g;
  }
  return r;
}

// Mismo cálculo de ganancia de siempre: solo líneas con costo (la mano de obra de taller sin costo cuenta como costo cero).
export function gananciaDeOrden(items: ItemR[]): number {
  let g = 0;
  for (const it of items) {
    const costo = costoDeLinea(it);
    if (costo != null && it.precio_unitario != null) g += (it.precio_unitario - costo) * (it.cantidad || 0);
  }
  return g;
}

// Ganancia efectivamente cobrada en el período: a cada venta (de cualquier fecha) se le cuenta la parte de su ganancia que se
// corresponde con la plata que de verdad entró en el período — pagos de la propia venta, lo recibido en el momento de venderla
// (anticipo y equipo de canje) y las cuotas de su plan que se cobraron. Una venta financiada en 6 cuotas aporta 1/6 de su ganancia por
// cada cuota cobrada, no todo el día de la venta. No incluye lo que se cobra de una venta fiada (cuenta corriente sin cuotas).
export function gananciaCobradaEnPeriodo(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, ItemR[]>,
  pagos: PagoR[],
  pagosDeCuotas: PagoCuotaR[],
  desde: Date,
  hasta: Date
): number {
  const pagosPorOrden = sumarPorOrden(pagos, (p) => p.orden_id, (p) => aNumero(p.monto), (p) => esDineroIngresado(p) && entre(p.fecha, desde, hasta));
  const cuotasPorOrden = sumarPorOrden(pagosDeCuotas, (p) => p.orden_id, (p) => aNumero(p.monto_aplicado), (p) => entre(p.created_at, desde, hasta));
  let total = 0;
  for (const o of ordenes) {
    if (!ESTADOS_COBRADOS.includes(o.estado)) continue;
    const valor = montoVenta(o);
    if (valor <= 0) continue;
    const g = gananciaDeOrden(itemsPorOrden.get(o.id) ?? []);
    if (g === 0) continue;
    let realizado = (pagosPorOrden.get(o.id) ?? 0) + (cuotasPorOrden.get(o.id) ?? 0);
    if (entre(o.created_at, desde, hasta)) realizado += (o.anticipo || 0) + (o.monto_canje || 0);
    total += g * Math.min(1, realizado / valor);
  }
  return total;
}
