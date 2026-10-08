// ============================================================
// Cartera de financiación: cada crédito tratado como una INVERSIÓN.
//
// Capa PURA (sin Supabase): recibe los créditos (planes), sus cuotas, los pagos
// aplicados y el costo de la mercadería entregada, y calcula cuánta plata está
// en la calle, cuánto volvió y cuándo se empieza a ganar.
//
// Regla de recupero: lo cobrado recupera PRIMERO el costo de la mercadería; solo
// lo que lo supera cuenta como ganancia cobrada. La cuota 1 (que en este negocio
// vence y se cobra el día de la venta) es un pago como cualquier otro y entra al
// recupero desde el primer día, esté o no cargada como "anticipo".
// ============================================================

export type PlanIn = {
  id: string;
  cliente_id: string;
  orden_id: string | null;
  moneda: string;
  importe_financiado: number;
  entrega_inicial: number;
  cantidad_cuotas: number;
  estado: string; // activo | completado | anulado | reprogramado
  created_at: string;
};
export type CuotaIn = { plan_id: string; fecha_vencimiento: string; importe_original: number; importe_pagado: number; estado: string };
export type PagoIn = { plan_id: string; monto: number; fecha: string };
// Lo que se sabe de la venta que originó el crédito.
export type InfoPlanIn = {
  costo: number; // costo de la mercadería entregada (lo invertido)
  costoCompleto: boolean; // false si algún ítem no tenía costo cargado
  cobradoInicial: number; // plata cobrada en el momento de la venta, fuera de las cuotas (anticipo)
  sucursal_id: string | null;
  categorias: string[];
  localidad: string | null;
};

export type EstadoCredito = 'recuperando' | 'ganancia' | 'cancelado' | 'sin_costo';

export type EventoCobro = { fecha: string; monto: number; capital: number; ganancia: number };

export type PlanCartera = {
  id: string;
  clienteId: string;
  ordenId: string | null;
  creadoEn: string;
  moneda: string;
  sucursalId: string | null;
  categorias: string[];
  localidad: string | null;
  costo: number;
  costoConocido: boolean;
  totalFinanciado: number; // suma de las cuotas
  cobrado: number; // plata que de verdad entró (incluida la cuota 1 y cualquier anticipo)
  faltaCobrar: number; // lo que todavía debe de las cuotas
  capitalRecuperado: number; // min(cobrado, costo)
  gananciaCobrada: number; // lo cobrado por encima del costo
  gananciaPendiente: number; // ganancia que todavía falta cobrar
  estado: EstadoCredito;
  eventos: EventoCobro[];
  fechaRecuperoCosto: string | null;
  diasParaRecuperar: number | null;
  cuotasPendientes: { vencimiento: string; pendiente: number }[];
};

const DIA = 86400000;
const EPS = 0.005;

export function calcularPlan(plan: PlanIn, cuotas: CuotaIn[], pagos: PagoIn[], info: InfoPlanIn): PlanCartera {
  const validas = cuotas.filter((c) => c.estado !== 'anulada');
  const totalFinanciado = validas.reduce((a, c) => a + c.importe_original, 0);
  const faltaCobrar = validas.reduce((a, c) => a + Math.max(0, c.importe_original - c.importe_pagado), 0);
  const cobradoInicial = Math.max(info.cobradoInicial, plan.entrega_inicial || 0);
  const costo = Math.max(0, info.costo);

  // Línea de tiempo de lo cobrado, en orden: primero lo del momento de la venta, después cada pago.
  const crudos = [
    ...(cobradoInicial > EPS ? [{ fecha: plan.created_at, monto: cobradoInicial }] : []),
    ...pagos.filter((p) => p.monto > EPS).map((p) => ({ fecha: p.fecha, monto: p.monto })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Sin costo cargado NO se sabe qué parte de lo cobrado es capital y cuál ganancia: no se inventa
  // ganancia (sería todo lo cobrado). Esos créditos suman a "cobrado" pero no al recupero.
  const sinCosto = costo <= EPS;
  let acumulado = 0;
  let fechaRecuperoCosto: string | null = null;
  const eventos: EventoCobro[] = crudos.map((e) => {
    const capital = sinCosto ? 0 : Math.max(0, Math.min(e.monto, costo - acumulado));
    acumulado += e.monto;
    if (fechaRecuperoCosto == null && !sinCosto && acumulado >= costo - EPS) fechaRecuperoCosto = e.fecha;
    return { fecha: e.fecha, monto: e.monto, capital, ganancia: sinCosto ? 0 : e.monto - capital };
  });

  const cobrado = acumulado;
  const ingresoEsperado = cobradoInicial + totalFinanciado;
  const costoConocido = !sinCosto && info.costoCompleto;
  const capitalRecuperado = sinCosto ? 0 : Math.min(cobrado, costo);
  const gananciaCobrada = sinCosto ? 0 : Math.max(0, cobrado - costo);
  const gananciaPendiente = sinCosto ? 0 : Math.max(0, ingresoEsperado - costo) - gananciaCobrada;

  let estado: EstadoCredito;
  if (plan.estado === 'anulado' || plan.estado === 'reprogramado') estado = 'cancelado';
  else if (costo <= EPS) estado = 'sin_costo';
  else estado = cobrado >= costo - EPS ? 'ganancia' : 'recuperando';

  const dias = fechaRecuperoCosto ? Math.max(0, Math.round((new Date(fechaRecuperoCosto).getTime() - new Date(plan.created_at).getTime()) / DIA)) : null;

  return {
    id: plan.id,
    clienteId: plan.cliente_id,
    ordenId: plan.orden_id,
    creadoEn: plan.created_at,
    moneda: plan.moneda,
    sucursalId: info.sucursal_id,
    categorias: info.categorias,
    localidad: info.localidad,
    costo,
    costoConocido,
    totalFinanciado,
    cobrado,
    faltaCobrar,
    capitalRecuperado,
    gananciaCobrada,
    gananciaPendiente: Math.max(0, gananciaPendiente),
    estado,
    eventos,
    fechaRecuperoCosto,
    diasParaRecuperar: dias,
    cuotasPendientes: validas
      .filter((c) => c.estado === 'pendiente' && c.importe_original - c.importe_pagado > EPS)
      .map((c) => ({ vencimiento: c.fecha_vencimiento, pendiente: c.importe_original - c.importe_pagado })),
  };
}

// Créditos que cuentan como "vigentes" (con deuda o ganancia por cobrar): sin cancelar ni reprogramar.
export const vigentes = (planes: PlanCartera[]) => planes.filter((p) => p.estado !== 'cancelado');

// Costo todavía NO recuperado de los créditos vigentes: la plata invertida que sigue en la calle.
export function capitalEnLaCalle(planes: PlanCartera[]): number {
  return vigentes(planes).reduce((a, p) => a + Math.max(0, p.costo - p.cobrado), 0);
}

// Porcentaje de lo invertido que ya volvió (sobre los créditos con costo conocido).
export function porcentajeRecupero(planes: PlanCartera[]): number | null {
  const con = vigentes(planes).filter((p) => p.costo > EPS);
  const invertido = con.reduce((a, p) => a + p.costo, 0);
  if (invertido <= EPS) return null;
  return (con.reduce((a, p) => a + p.capitalRecuperado, 0) / invertido) * 100;
}

export function recuperoEnPeriodo(planes: PlanCartera[], desde: Date, hasta: Date): { capital: number; ganancia: number; total: number } {
  let capital = 0;
  let ganancia = 0;
  for (const p of vigentes(planes)) {
    for (const e of p.eventos) {
      const f = new Date(e.fecha);
      if (f >= desde && f <= hasta) {
        capital += e.capital;
        ganancia += e.ganancia;
      }
    }
  }
  return { capital, ganancia, total: capital + ganancia };
}

export const gananciaPendienteTotal = (planes: PlanCartera[]) => vigentes(planes).reduce((a, p) => a + p.gananciaPendiente, 0);

// Cuántos días tarda, en promedio, un crédito en recuperar su costo (solo los que ya lo recuperaron).
export function tiempoPromedioRecupero(planes: PlanCartera[]): { dias: number; creditos: number } | null {
  const con = vigentes(planes).filter((p) => p.diasParaRecuperar != null);
  if (con.length === 0) return null;
  return { dias: con.reduce((a, p) => a + (p.diasParaRecuperar ?? 0), 0) / con.length, creditos: con.length };
}

export type TramoMora = { tramo: '1-30' | '31-60' | '60+'; monto: number; cuotas: number };

// Mora: lo vencido y todavía impago, por tramo de días de atraso (hoy = 'YYYY-MM-DD' local).
export function moraPorTramo(planes: PlanCartera[], hoy: string): { total: number; cuotas: number; tramos: TramoMora[]; maxDias: number } {
  const tramos: TramoMora[] = [
    { tramo: '1-30', monto: 0, cuotas: 0 },
    { tramo: '31-60', monto: 0, cuotas: 0 },
    { tramo: '60+', monto: 0, cuotas: 0 },
  ];
  const hoyMs = new Date(hoy + 'T00:00:00').getTime();
  let maxDias = 0;
  for (const p of vigentes(planes)) {
    for (const c of p.cuotasPendientes) {
      if (c.vencimiento >= hoy) continue;
      const dias = Math.round((hoyMs - new Date(c.vencimiento + 'T00:00:00').getTime()) / DIA);
      if (dias < 1) continue;
      maxDias = Math.max(maxDias, dias);
      const t = dias <= 30 ? tramos[0] : dias <= 60 ? tramos[1] : tramos[2];
      t.monto += c.pendiente;
      t.cuotas += 1;
    }
  }
  return { total: tramos.reduce((a, t) => a + t.monto, 0), cuotas: tramos.reduce((a, t) => a + t.cuotas, 0), tramos, maxDias };
}

export function otorgadosEnPeriodo(planes: PlanCartera[], desde: Date, hasta: Date) {
  const en = planes.filter((p) => {
    const f = new Date(p.creadoEn);
    return f >= desde && f <= hasta && p.estado !== 'cancelado';
  });
  return { cantidad: en.length, financiado: en.reduce((a, p) => a + p.totalFinanciado, 0), costo: en.reduce((a, p) => a + p.costo, 0) };
}

export type FilaOriginacion = { mes: string; creditos: number; invertido: number; recuperado: number; gananciaCobrada: number; pctRecuperado: number | null };

// Retorno por mes de originación: de los créditos otorgados cada mes, cuánto se invirtió, cuánto
// del costo volvió hasta hoy y cuánta ganancia ya se cobró. `mes` = 'YYYY-MM' (hora local).
export function retornoPorMesDeOriginacion(planes: PlanCartera[]): FilaOriginacion[] {
  const mapa = new Map<string, FilaOriginacion>();
  for (const p of vigentes(planes)) {
    const d = new Date(p.creadoEn);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const f = mapa.get(mes) ?? { mes, creditos: 0, invertido: 0, recuperado: 0, gananciaCobrada: 0, pctRecuperado: null };
    f.creditos += 1;
    f.invertido += p.costo;
    f.recuperado += p.capitalRecuperado;
    f.gananciaCobrada += p.gananciaCobrada;
    mapa.set(mes, f);
  }
  return Array.from(mapa.values())
    .map((f) => ({ ...f, pctRecuperado: f.invertido > EPS ? (f.recuperado / f.invertido) * 100 : null }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

// Proyección de cobranzas: lo que debería entrar por cuotas en los próximos 30/60/90 días
// (y lo que ya está vencido y debería haber entrado). hoy = 'YYYY-MM-DD' local.
export function proyeccionCobranzas(planes: PlanCartera[], hoy: string): { vencido: number; d30: number; d60: number; d90: number } {
  const hoyMs = new Date(hoy + 'T00:00:00').getTime();
  const r = { vencido: 0, d30: 0, d60: 0, d90: 0 };
  for (const p of vigentes(planes)) {
    for (const c of p.cuotasPendientes) {
      if (c.vencimiento < hoy) {
        r.vencido += c.pendiente;
        continue;
      }
      const dias = Math.round((new Date(c.vencimiento + 'T00:00:00').getTime() - hoyMs) / DIA);
      if (dias <= 30) r.d30 += c.pendiente;
      else if (dias <= 60) r.d60 += c.pendiente;
      else if (dias <= 90) r.d90 += c.pendiente;
    }
  }
  return r;
}

// ---------- Ventas: pago exclusivo vs financiado ----------
export type GrupoVenta = 'exclusivo' | 'financiado' | 'otros';

// Medios que cuentan como "pago exclusivo" (precio contado). Todo lo demás (crédito de
// tarjeta, cuenta corriente sin cronograma) va a "otros".
const MEDIOS_EXCLUSIVOS = new Set(['efectivo', 'transferencia', 'debito', 'débito', 'usdt']);
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Una venta es FINANCIADA si tiene un plan de cuotas propias; es de PAGO EXCLUSIVO si se
// cobró solo con contado/transferencia/débito; el resto queda en "otros".
export function grupoDeVenta(formaPago: string | null | undefined, tienePlan: boolean): GrupoVenta {
  if (tienePlan) return 'financiado';
  const medios = (formaPago ?? '')
    .split('+')
    .map((m) => sinAcentos(m))
    .filter(Boolean);
  if (medios.length > 0 && medios.every((m) => MEDIOS_EXCLUSIVOS.has(m))) return 'exclusivo';
  return 'otros';
}
