// ============================================================
// Analítica (Estadísticas v2) — capa de datos PURA.
//
// Todo acá son funciones puras: reciben datos ya traídos + un "ahora" y
// devuelven métricas. Sin Supabase, sin Date.now() escondido — así son
// fáciles de testear y de razonar. El fetching vive en la página.
// ============================================================

export type Periodo = 'hoy' | 'semana' | 'mes' | 'anio';

// Un rango de análisis + su período anterior EQUIVALENTE (misma duración,
// justo antes), para comparar peras con peras (no 5 días vs un mes entero).
export type Rango = {
  periodo: Periodo;
  inicio: Date;
  fin: Date;
  inicioPrev: Date;
  finPrev: Date;
  // Granularidad del gráfico de evolución.
  bucket: 'hora' | 'dia' | 'mes';
};

// ---------- Tipos de datos crudos (subconjunto de columnas que usamos) ----------
export type OrdenR = {
  id: string;
  vendedor_id: string | null;
  cliente_id: string | null;
  total: number | null;
  anticipo: number | null;
  monto_canje: number | null;
  estado: string;
  forma_pago: string | null;
  created_at: string;
};
export type ItemR = {
  orden_id: string;
  cantidad: number;
  precio_unitario: number | null;
  costo: number | null;
};
export type PagoR = { medio: string; monto: number; fecha: string };
export type CreditoR = { concepto: string; tipo: string; monto: number; fecha: string };

export const ESTADOS_COBRADOS = ['pagado', 'entregado'];

// Valor real de la venta (ver comentario original en la página): el "total"
// ya viene con anticipo y canje descontados, pero la venta valió eso igual.
export function montoVenta(o: OrdenR): number {
  return (o.total || 0) + (o.anticipo || 0) + (o.monto_canje || 0);
}

// ---------- Rango del período + su equivalente anterior ----------
//
// "fechaReferencia" ancla QUÉ tramo se mira (por defecto, "ahora" — el
// período actual, como siempre). Si se navega a un período que ya cerró
// (ej. "la semana pasada"), el rango pasa a ser el tramo COMPLETO (lunes a
// domingo, 1 al último día del mes, etc.) en vez de "desde el inicio hasta
// ahora" — no tendría sentido cortar una semana ya terminada a la mitad. Si
// el período elegido resulta ser el actual (contiene a "ahora"), se sigue
// comportando exactamente como antes: tramo parcial hasta este momento,
// comparado con el mismo tramo parcial del período anterior.
export function rangoDe(periodo: Periodo, ahora: Date, fechaReferencia: Date = ahora): Rango {
  let inicio: Date;
  let finCerrado: Date;
  let inicioPrev: Date;
  let finPrevCerrado: Date;
  let finPrevParcial: Date;
  let bucket: Rango['bucket'] = 'dia';

  if (periodo === 'hoy') {
    inicio = new Date(fechaReferencia);
    inicio.setHours(0, 0, 0, 0);
    finCerrado = new Date(inicio);
    finCerrado.setHours(23, 59, 59, 999);
    inicioPrev = new Date(inicio);
    inicioPrev.setDate(inicioPrev.getDate() - 1);
    finPrevCerrado = new Date(inicioPrev);
    finPrevCerrado.setHours(23, 59, 59, 999);
    // Ayer, hasta la misma hora (si el día elegido es hoy).
    finPrevParcial = new Date(ahora);
    finPrevParcial.setDate(finPrevParcial.getDate() - 1);
    bucket = 'hora';
  } else if (periodo === 'semana') {
    // Semana calendario (lunes → domingo), no "últimos 7 días": con
    // "Mes"/"Año" ya se entiende como "desde el inicio del período", pero
    // acá antes era una ventana móvil de 7 días — confundía (ej. un martes
    // sumaba también el fin de semana pasado, dando un total inflado que
    // parecía de "la semana" cuando en realidad eran 6 días de la anterior).
    const diaSemana = fechaReferencia.getDay(); // 0 = domingo … 6 = sábado
    const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    inicio = new Date(fechaReferencia);
    inicio.setDate(inicio.getDate() - diasDesdeLunes);
    inicio.setHours(0, 0, 0, 0);
    finCerrado = new Date(inicio);
    finCerrado.setDate(finCerrado.getDate() + 6);
    finCerrado.setHours(23, 59, 59, 999);
    // Mismo tramo (lunes → el mismo día de la semana) de la semana anterior.
    inicioPrev = new Date(inicio);
    inicioPrev.setDate(inicioPrev.getDate() - 7);
    finPrevCerrado = new Date(finCerrado);
    finPrevCerrado.setDate(finPrevCerrado.getDate() - 7);
    finPrevParcial = new Date(ahora);
    finPrevParcial.setDate(finPrevParcial.getDate() - 7);
    bucket = 'dia';
  } else if (periodo === 'mes') {
    inicio = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 1, 0, 0, 0, 0);
    finCerrado = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 0, 23, 59, 59, 999);
    inicioPrev = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - 1, 1, 0, 0, 0, 0);
    finPrevCerrado = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 0, 23, 59, 59, 999);
    // Mismos días del mes anterior (1 → mismo día de hoy).
    finPrevParcial = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - 1, ahora.getDate(), ahora.getHours(), ahora.getMinutes(), 59, 999);
    bucket = 'dia';
  } else {
    // año: 1 de enero → 31 de diciembre; comparado con el mismo tramo del año pasado.
    inicio = new Date(fechaReferencia.getFullYear(), 0, 1, 0, 0, 0, 0);
    finCerrado = new Date(fechaReferencia.getFullYear(), 11, 31, 23, 59, 59, 999);
    inicioPrev = new Date(fechaReferencia.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    finPrevCerrado = new Date(fechaReferencia.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    finPrevParcial = new Date(fechaReferencia.getFullYear() - 1, ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    bucket = 'mes';
  }

  // El período elegido es "el actual" si contiene el instante real de
  // "ahora" — recién ahí tiene sentido cortarlo parcialmente en vez de
  // usar el tramo cerrado completo.
  const esPeriodoActual = ahora.getTime() >= inicio.getTime() && ahora.getTime() <= finCerrado.getTime();
  const fin = esPeriodoActual ? new Date(ahora) : finCerrado;
  const finPrev = esPeriodoActual ? finPrevParcial : finPrevCerrado;

  return { periodo, inicio, fin, inicioPrev, finPrev, bucket };
}

function entre(fechaISO: string, desde: Date, hasta: Date): boolean {
  const t = new Date(fechaISO).getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

// ---------- KPIs del Resumen (para un tramo cualquiera) ----------
export type BloqueVentas = {
  ventas: number; // facturado
  ganancia: number; // margen sobre lo que tiene costo cargado
  ventasConCosto: number; // facturado de las líneas con costo (para cobertura)
  ingresado: number; // caja (pagos)
  credito: number; // vendido a cuenta corriente
  operaciones: number; // cantidad de órdenes cobradas
  unidades: number; // dispositivos/unidades
};

export function bloqueVentas(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, ItemR[]>,
  pagos: PagoR[],
  credito: CreditoR[],
  desde: Date,
  hasta: Date
): BloqueVentas {
  const cobradas = ordenes.filter((o) => ESTADOS_COBRADOS.includes(o.estado) && entre(o.created_at, desde, hasta));
  const ventas = cobradas.reduce((a, o) => a + montoVenta(o), 0);

  let ganancia = 0;
  let ventasConCosto = 0;
  let unidades = 0;
  for (const o of cobradas) {
    const items = itemsPorOrden.get(o.id) ?? [];
    for (const it of items) {
      unidades += it.cantidad || 0;
      if (it.costo != null && it.precio_unitario != null) {
        ganancia += (it.precio_unitario - it.costo) * (it.cantidad || 0);
        ventasConCosto += it.precio_unitario * (it.cantidad || 0);
      }
    }
    if (items.length === 0) unidades += 1; // fallback si no vinieron los ítems
  }

  const ingresado = pagos.filter((p) => entre(p.fecha, desde, hasta)).reduce((a, p) => a + (p.monto || 0), 0);
  const creditoOtorgado = credito
    .filter((m) => m.tipo === 'cargo' && m.concepto === 'venta' && entre(m.fecha, desde, hasta))
    .reduce((a, m) => a + (m.monto || 0), 0);

  return {
    ventas,
    ganancia,
    ventasConCosto,
    ingresado,
    credito: creditoOtorgado,
    operaciones: cobradas.length,
    unidades,
  };
}

// Variación entre dos valores. Devuelve null si el anterior es 0 (para no
// mostrar "↑∞%" — en ese caso la UI muestra solo el valor absoluto).
export function variacion(actual: number, anterior: number): { pct: number | null; abs: number } {
  const abs = actual - anterior;
  if (!anterior) return { pct: null, abs };
  return { pct: (abs / Math.abs(anterior)) * 100, abs };
}

// ---------- Serie de evolución (actual + anterior superpuesto) ----------
export type PuntoSerie = { label: string; actual: number; anterior: number | null };
export type MetricaSerie = 'ventas' | 'ingresado' | 'ganancia';

function valorOrdenPara(o: OrdenR, items: ItemR[], metrica: MetricaSerie): number {
  if (metrica === 'ventas') return montoVenta(o);
  if (metrica === 'ganancia') {
    return items.reduce((a, it) => a + (it.costo != null && it.precio_unitario != null ? (it.precio_unitario - it.costo) * (it.cantidad || 0) : 0), 0);
  }
  return 0; // 'ingresado' se calcula aparte (viene de pagos, no de órdenes)
}

// Genera los buckets del gráfico según el rango, con la serie del período
// actual y la del anterior alineada por posición (para la línea punteada).
export function serieEvolucion(
  ordenes: OrdenR[],
  itemsPorOrden: Map<string, ItemR[]>,
  pagos: PagoR[],
  rango: Rango,
  metrica: MetricaSerie
): PuntoSerie[] {
  const cobradas = (desde: Date, hasta: Date) =>
    ordenes.filter((o) => ESTADOS_COBRADOS.includes(o.estado) && entre(o.created_at, desde, hasta));

  // Arma los buckets (labels + límites) del tramo actual.
  const buckets: { label: string; ini: Date; fin: Date }[] = [];
  if (rango.bucket === 'mes') {
    const meses = rango.fin.getMonth();
    for (let m = 0; m <= meses; m++) {
      const ini = new Date(rango.inicio.getFullYear(), m, 1, 0, 0, 0, 0);
      const fin = new Date(rango.inicio.getFullYear(), m + 1, 0, 23, 59, 59, 999);
      buckets.push({ label: new Date(2000, m, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''), ini, fin });
    }
  } else if (rango.bucket === 'hora') {
    for (let h = 0; h < 24; h++) {
      const ini = new Date(rango.inicio);
      ini.setHours(h, 0, 0, 0);
      const fin = new Date(rango.inicio);
      fin.setHours(h, 59, 59, 999);
      buckets.push({ label: `${h}h`, ini, fin });
    }
  } else {
    const cursor = new Date(rango.inicio);
    while (cursor <= rango.fin) {
      const ini = new Date(cursor);
      ini.setHours(0, 0, 0, 0);
      const fin = new Date(cursor);
      fin.setHours(23, 59, 59, 999);
      buckets.push({
        label: cursor.toLocaleDateString('es-AR', { day: 'numeric', month: rango.periodo === 'semana' ? 'short' : undefined }),
        ini,
        fin,
      });
      // Sin esto el cursor nunca avanza: bucle infinito que cuelga el navegador
      // ("la página no responde"). Era la causa real del freeze de Analítica.
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const sumaEnTramo = (desde: Date, hasta: Date): number => {
    if (metrica === 'ingresado') {
      return pagos.filter((p) => entre(p.fecha, desde, hasta)).reduce((a, p) => a + (p.monto || 0), 0);
    }
    return cobradas(desde, hasta).reduce((a, o) => a + valorOrdenPara(o, itemsPorOrden.get(o.id) ?? [], metrica), 0);
  };

  // Desfase temporal entre el tramo actual y el anterior, para alinear el bucket i.
  const offset = rango.inicio.getTime() - rango.inicioPrev.getTime();

  return buckets.map((b) => {
    const anteriorIni = new Date(b.ini.getTime() - offset);
    const anteriorFin = new Date(b.fin.getTime() - offset);
    return {
      label: b.label,
      actual: sumaEnTramo(b.ini, b.fin),
      anterior: sumaEnTramo(anteriorIni, anteriorFin),
    };
  });
}
