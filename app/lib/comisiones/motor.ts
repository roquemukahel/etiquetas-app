// ============================================================
// Motor de cálculo de comisiones — FUNCIONES PURAS.
//
// Sin Supabase, sin React, sin Date.now(): recibe datos y devuelve números.
// Toda la aritmética de dinero pasa por `redondear` (política central,
// determinista, según los decimales de la moneda del negocio). El backend es
// la ÚNICA autoridad: este motor se usa del lado del servidor para generar los
// movimientos; el navegador nunca decide importes.
//
// Alcance de esta fase (ver prompt §1/§6): solo comisiones. Nada de intereses,
// cuotas, financiación ni CFT.
// ============================================================

export type TipoCalculo =
  | 'porcentaje_venta' // % sobre la base neta comisionable
  | 'porcentaje_ganancia' // % sobre (base − costo histórico), solo si > 0
  | 'fijo_por_unidad' // importe fijo × cantidad
  | 'fijo_por_venta'; // importe fijo una sola vez por venta

// A qué se aplica una regla. "categoria" en Qovento se mapea al TIPO de ítem
// (dispositivo/producto/trabajo), que es lo más parecido que existe hoy.
// 'contado'/'financiado' son la misma idea que minorista/mayorista pero sobre
// otra dimensión de la venta (cómo se pagó, no a quién se le vendió) — no se
// combinan entre sí: una regla es de una dimensión U OTRA, igual que ya
// pasaba entre minorista/mayorista y tipo_item/producto.
export type AlcanceRegla = 'todas' | 'minorista' | 'mayorista' | 'contado' | 'financiado' | 'tipo_item' | 'producto';

export type TipoVenta = 'minorista' | 'mayorista';

// Especificidad para desempatar qué regla aplica (más alto = más específico).
const ESPECIFICIDAD: Record<AlcanceRegla, number> = {
  producto: 4,
  tipo_item: 3,
  minorista: 2,
  mayorista: 2,
  contado: 2,
  financiado: 2,
  todas: 1,
};

export type Regla = {
  id: string;
  tipo_calculo: TipoCalculo;
  valor: number; // porcentaje (0..100) o importe fijo, según tipo_calculo
  alcance: AlcanceRegla;
  tipo_item?: string | null; // requerido si alcance === 'tipo_item'
  producto_id?: string | null; // requerido si alcance === 'producto'
  prioridad?: number; // desempate explícito cuando la especificidad es igual (mayor gana)
};

export type LineaVenta = {
  id: string;
  tipo_item: string; // 'dispositivo' | 'producto' | 'trabajo'
  producto_id: string | null;
  cantidad: number;
  precio_unitario: number;
  // Descuentos: hoy Qovento no los guarda (se pasan 0), pero el motor los
  // soporta para no rehacerlo si en el futuro se agregan.
  descuento_linea?: number;
  // Costo histórico (snapshot al vender), para porcentaje_ganancia. null = sin costo.
  costo_unitario?: number | null;
};

export type Venta = {
  tipo_venta: TipoVenta;
  // true si la venta se financió (tiene cuotas con recargo) — false/ausente
  // para contado, incluyendo pagos con tarjeta/transferencia en un solo pago.
  es_financiado?: boolean;
  lineas: LineaVenta[];
  descuento_general?: number; // descuento a nivel venta (hoy 0), se prorratea entre líneas
};

export type DetalleLinea = {
  linea_id: string;
  base: number;
  regla_id: string | null;
  tipo_calculo: TipoCalculo | null;
  comision: number;
};

export type ResultadoComision = {
  base: number; // base comisionable total (suma exacta de las bases de línea)
  comision: number; // comisión total
  detalle: DetalleLinea[];
};

// ---------- Redondeo central y determinista (half-up) ----------
// Trabaja con corrección de epsilon para evitar los clásicos 1.005 → 1.00 por
// binario flotante. Nunca se guardan floats: Postgres usa numeric; acá solo se
// calcula y se redondea a los decimales de la moneda.
export function redondear(monto: number, decimales: number): number {
  if (!isFinite(monto)) return 0;
  const f = Math.pow(10, decimales);
  const signo = monto < 0 ? -1 : 1;
  const escalado = Math.abs(monto) * f;
  // Épsilon relativo a la magnitud: contrarresta el error de representación
  // binaria (ej. 1.005×100 = 100.49999…) sin empujar de más un valor real.
  const epsilon = Math.max(1e-9, escalado * 1e-12);
  return (signo * Math.round(escalado + epsilon)) / f;
}

// ---------- Base comisionable de una línea ----------
// base = cantidad × precio_unitario − descuento_linea − prorrateo(descuento_general)
// El prorrateo del descuento general se calcula aparte (necesita el total de la
// venta); acá va la base SIN el descuento general.
export function baseBrutaLinea(l: LineaVenta): number {
  const bruto = (l.cantidad || 0) * (l.precio_unitario || 0);
  return Math.max(0, bruto - (l.descuento_linea || 0));
}

// Prorratea el descuento general entre las líneas, proporcional a su base bruta,
// de forma DETERMINISTA: el remanente por redondeo va a la última línea, así la
// suma de las bases coincide exactamente con (total elegible − descuento general).
function basesConDescuentoGeneral(venta: Venta, decimales: number): number[] {
  const brutas = venta.lineas.map(baseBrutaLinea);
  const totalBruto = brutas.reduce((a, b) => a + b, 0);
  const desc = venta.descuento_general || 0;
  if (desc <= 0 || totalBruto <= 0) return brutas.map((b) => redondear(b, decimales));

  const objetivo = redondear(Math.max(0, totalBruto - desc), decimales);
  const bases: number[] = [];
  let acumulado = 0;
  for (let i = 0; i < brutas.length; i++) {
    if (i === brutas.length - 1) {
      bases.push(redondear(objetivo - acumulado, decimales)); // remanente exacto a la última
    } else {
      const proporcional = redondear((brutas[i] / totalBruto) * objetivo, decimales);
      bases.push(proporcional);
      acumulado += proporcional;
    }
  }
  return bases;
}

// ---------- Resolver qué regla aplica a una línea ----------
function reglaAplicaALinea(r: Regla, l: LineaVenta, venta: Venta): boolean {
  switch (r.alcance) {
    case 'todas':
      return true;
    case 'minorista':
    case 'mayorista':
      return venta.tipo_venta === r.alcance;
    case 'contado':
      return !venta.es_financiado;
    case 'financiado':
      return !!venta.es_financiado;
    case 'tipo_item':
      return !!r.tipo_item && l.tipo_item === r.tipo_item;
    case 'producto':
      return !!r.producto_id && l.producto_id === r.producto_id;
    default:
      return false;
  }
}

// Devuelve la regla MÁS específica que aplica a la línea (producto > tipo_item >
// minorista/mayorista > todas). Empate de especificidad → mayor `prioridad` →
// menor id (determinista). Por defecto NO se suman reglas: una sola por línea.
export function reglaParaLinea(l: LineaVenta, venta: Venta, reglas: Regla[]): Regla | null {
  const candidatas = reglas.filter((r) => reglaAplicaALinea(r, l, venta));
  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => {
    const ea = ESPECIFICIDAD[a.alcance];
    const eb = ESPECIFICIDAD[b.alcance];
    if (ea !== eb) return eb - ea;
    const pa = a.prioridad ?? 0;
    const pb = b.prioridad ?? 0;
    if (pa !== pb) return pb - pa;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return candidatas[0];
}

// ---------- Comisión de una venta completa ----------
// Suma, por línea, la comisión de su regla más específica. `fijo_por_venta` es
// una regla de venta (todas/minorista/mayorista): se aplica UNA sola vez y, en
// ese caso, reemplaza el cálculo por línea (no se suma sobre otras reglas).
export function calcularComisionVenta(venta: Venta, reglas: Regla[], decimales: number): ResultadoComision {
  const bases = basesConDescuentoGeneral(venta, decimales);

  const detalle: DetalleLinea[] = [];
  let baseTotal = 0;
  let comisionTotal = 0;
  // Un "monto fijo por venta" se cobra UNA sola vez, aunque su regla sea la más
  // específica en varias líneas (ej. varios dispositivos): se registra en la
  // primera línea donde gana y se marca como ya aplicada.
  const fijasAplicadas = new Set<string>();

  venta.lineas.forEach((l, i) => {
    const base = bases[i];
    baseTotal += base;
    const regla = reglaParaLinea(l, venta, reglas);
    let comision = 0;
    if (regla) {
      switch (regla.tipo_calculo) {
        case 'porcentaje_venta':
          comision = (base * regla.valor) / 100;
          break;
        case 'porcentaje_ganancia': {
          // Sin costo histórico NO se puede calcular la ganancia: no se genera
          // comisión (nunca se asume costo 0, que pagaría de más).
          if (l.costo_unitario == null) {
            comision = 0;
            break;
          }
          const costo = l.costo_unitario * (l.cantidad || 0);
          const ganancia = base - costo;
          comision = ganancia > 0 ? (ganancia * regla.valor) / 100 : 0;
          break;
        }
        case 'fijo_por_unidad':
          comision = regla.valor * (l.cantidad || 0);
          break;
        case 'fijo_por_venta':
          // Una sola vez por venta, sin importar el alcance (todas / minorista /
          // mayorista / tipo de ítem / producto).
          comision = fijasAplicadas.has(regla.id) ? 0 : regla.valor;
          fijasAplicadas.add(regla.id);
          break;
      }
    }
    comision = redondear(comision, decimales);
    comisionTotal += comision;
    detalle.push({ linea_id: l.id, base, regla_id: regla?.id ?? null, tipo_calculo: regla?.tipo_calculo ?? null, comision });
  });

  return { base: redondear(baseTotal, decimales), comision: redondear(comisionTotal, decimales), detalle };
}

// ---------- Reparto entre vendedores (venta compartida) ----------
export type Participacion = { vendedor_id: string; porcentaje: number }; // deben sumar 100

// Reparte un monto según participaciones garantizando que la suma coincide
// exactamente (el remanente por redondeo va al último). Sirve para base y comisión.
export function repartir(monto: number, participaciones: Participacion[], decimales: number): { vendedor_id: string; monto: number }[] {
  if (participaciones.length === 0) return [];
  const total = redondear(monto, decimales);
  const res: { vendedor_id: string; monto: number }[] = [];
  let acumulado = 0;
  participaciones.forEach((p, i) => {
    if (i === participaciones.length - 1) {
      res.push({ vendedor_id: p.vendedor_id, monto: redondear(total - acumulado, decimales) });
    } else {
      const parte = redondear((total * p.porcentaje) / 100, decimales);
      res.push({ vendedor_id: p.vendedor_id, monto: parte });
      acumulado += parte;
    }
  });
  return res;
}

// La suma de las participaciones debe ser exactamente 100 (validación central).
export function participacionesValidas(participaciones: Participacion[]): boolean {
  if (participaciones.length === 0) return false;
  const suma = participaciones.reduce((a, p) => a + (p.porcentaje || 0), 0);
  return Math.abs(suma - 100) < 1e-9 && participaciones.every((p) => p.porcentaje > 0);
}

// ---------- Reversión proporcional por devolución ----------
// fraccionDevuelta ∈ [0,1] sobre la parte comisionable devuelta. Devuelve un
// monto NEGATIVO (movimiento de reversión). Ej: 1800 al 50% → -900.
export function reversionProporcional(comisionOriginal: number, fraccionDevuelta: number, decimales: number): number {
  const f = Math.min(1, Math.max(0, fraccionDevuelta));
  return -redondear(comisionOriginal * f, decimales);
}
