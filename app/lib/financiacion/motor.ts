// ============================================================
// Motor de financiación propia en cuotas — FUNCIONES PURAS.
//
// Sin Supabase, sin React, sin Date.now() escondido: recibe datos y devuelve
// resultados. El backend/capa de dominio es la ÚNICA autoridad para calcular
// cronogramas, aplicar pagos y armar la proyección — el frontend solo
// presenta lo que este motor ya calculó. Mismo criterio que
// app/lib/comisiones/motor.ts (módulo hermano, mismo estilo).
//
// Fechas: acá adentro se trabaja con componentes de fecha LOCALES (año/mes/
// día), nunca con toISOString()/UTC — mismo criterio que
// app/estadisticas/datos.ts (rangoDe) y app/lib/reparaciones.ts (esHoy,
// calcularAlertas). No existe un concepto de "zona horaria del negocio" en
// today Qovento (todo asume la hora local del navegador/servidor); esto
// mantiene el mismo comportamiento, no inventa infraestructura nueva.
// ============================================================

// ---------- Redondeo central y determinista (half-up) ----------
// Idéntico a app/lib/comisiones/motor.ts — no se duplica por import porque
// comisiones vive en una rama sin mergear (no se puede depender de ella
// desde acá), pero es la MISMA política: nunca floats crudos, redondeo
// determinista con corrección de épsilon.
export function redondear(monto: number, decimales: number): number {
  if (!isFinite(monto)) return 0;
  const f = Math.pow(10, decimales);
  const signo = monto < 0 ? -1 : 1;
  const escalado = Math.abs(monto) * f;
  const epsilon = Math.max(1e-9, escalado * 1e-12);
  return (signo * Math.round(escalado + epsilon)) / f;
}

// ---------- Fecha local sin hora (YYYY-MM-DD), sin UTC ----------
// Mismo truco que reparaciones.ts (calcularAlertas): un string 'YYYY-MM-DD'
// solo, parseado directo, cae en UTC medianoche — sumarle 'T00:00:00' fuerza
// al motor de JS a interpretarlo como medianoche LOCAL.
export function fechaLocal(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

export function aFechaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

// Mismo día calendario, comparando componentes locales (no epoch/UTC).
function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ---------- Generación del cronograma ----------
export type CuotaCronograma = {
  numero: number;
  fecha_vencimiento: string; // YYYY-MM-DD
  importe: number;
};

// Suma un mes a una fecha, manteniendo el mismo día — si ese día no existe
// en el mes siguiente (ej. 31 de enero → febrero), usa el último día válido
// de ese mes (no "rebota" a marzo, que es el bug clásico de sumar meses con
// setMonth ingenuo).
export function sumarMesConClamp(fecha: Date, meses: number): Date {
  const diaOriginal = fecha.getDate();
  const base = new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1);
  const ultimoDiaDelMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(diaOriginal, ultimoDiaDelMes));
  return base;
}

// Cronograma mensual: N cuotas iguales a partir del importe financiado,
// misma cifra cada mes salvo la ÚLTIMA que absorbe el resto del redondeo
// (así la suma de las cuotas da EXACTO el importe financiado, nunca queda
// un centavo de diferencia "perdido"). Una financiación de 1 sola cuota es
// válida (venta con un único vencimiento).
export function generarCronograma(params: {
  importeFinanciado: number;
  cantidadCuotas: number;
  primeraFecha: string; // YYYY-MM-DD
  decimales: number;
}): CuotaCronograma[] {
  const { importeFinanciado, cantidadCuotas, primeraFecha, decimales } = params;
  if (cantidadCuotas <= 0) throw new Error('La cantidad de cuotas debe ser mayor a 0.');
  if (importeFinanciado <= 0) throw new Error('El importe financiado debe ser mayor a 0.');

  const base = redondear(importeFinanciado / cantidadCuotas, decimales);
  const primera = fechaLocal(primeraFecha);
  const cuotas: CuotaCronograma[] = [];
  let acumulado = 0;

  for (let i = 0; i < cantidadCuotas; i++) {
    const esUltima = i === cantidadCuotas - 1;
    const importe = esUltima ? redondear(importeFinanciado - acumulado, decimales) : base;
    acumulado += importe;
    const fecha = i === 0 ? primera : sumarMesConClamp(primera, i);
    cuotas.push({ numero: i + 1, fecha_vencimiento: aFechaISO(fecha), importe });
  }
  return cuotas;
}

// ---------- Estado visual de una cuota ----------
// El estado PERSISTIDO en la base es simple: 'pendiente' | 'pagada' |
// 'anulada'. Los 8 estados visuales que pide la spec se DERIVAN acá, en
// función de fecha/importe — nunca se guardan como texto (evita que un
// cronograma viejo quede con una etiqueta vencida congelada en el tiempo).
export type EstadoVisualCuota =
  | 'pendiente'
  | 'proxima_a_vencer'
  | 'vence_hoy'
  | 'parcialmente_pagada'
  | 'vencida'
  | 'parcial_y_vencida'
  | 'pagada'
  | 'anulada';

export type CuotaEstado = {
  fecha_vencimiento: string; // YYYY-MM-DD
  importe_original: number;
  importe_pagado: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
};

const DIAS_PROXIMA_A_VENCER = 7;

// `hoy` se pasa siempre desde afuera (nunca `new Date()` adentro) para que
// esta función sea 100% pura y testeable de forma determinista.
export function estadoVisualCuota(c: CuotaEstado, hoy: Date): EstadoVisualCuota {
  if (c.estado === 'anulada') return 'anulada';
  if (c.estado === 'pagada') return 'pagada';

  const saldo = redondear(c.importe_original - c.importe_pagado, 2);
  const tienePagoParcial = c.importe_pagado > 0.009 && saldo > 0.009;
  const vencimiento = fechaLocal(c.fecha_vencimiento);
  const hoyMedianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diffDias = Math.round((vencimiento.getTime() - hoyMedianoche.getTime()) / 86400000);

  const vencida = diffDias < 0;
  const venceHoy = diffDias === 0;
  const proximaAVencer = diffDias > 0 && diffDias <= DIAS_PROXIMA_A_VENCER;

  if (vencida) return tienePagoParcial ? 'parcial_y_vencida' : 'vencida';
  if (tienePagoParcial) return 'parcialmente_pagada';
  if (venceHoy) return 'vence_hoy';
  if (proximaAVencer) return 'proxima_a_vencer';
  return 'pendiente';
}

// ---------- Aplicación de un pago a una o varias cuotas ----------
export type CuotaParaAplicar = {
  id: string;
  fecha_vencimiento: string;
  importe_original: number;
  importe_pagado: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
};

export type AsignacionPago = { cuota_id: string; monto: number };

// Si se pasa `cuotaIdElegida`, el pago se aplica SOLO a esa cuota (hasta su
// saldo pendiente; el resto, si sobra, NO se auto-asigna a otras — eso lo
// decide quien llama, mostrando el sobrante). Sin cuota elegida: se reparte
// automáticamente empezando por las VENCIDAS (de la más vieja a la más
// nueva) y después las pendientes futuras en orden de vencimiento — un
// mismo pago puede cubrir varias cuotas si alcanza.
export function aplicarPagoACuotas(params: {
  cuotas: CuotaParaAplicar[];
  monto: number;
  decimales: number;
  hoy: Date;
  cuotaIdElegida?: string;
}): { asignaciones: AsignacionPago[]; sobrante: number } {
  const { cuotas, decimales, hoy, cuotaIdElegida } = params;
  let restante = redondear(params.monto, decimales);
  if (restante <= 0) return { asignaciones: [], sobrante: 0 };

  const saldoDe = (c: CuotaParaAplicar) => redondear(c.importe_original - c.importe_pagado, decimales);
  const pendientes = cuotas.filter((c) => c.estado === 'pendiente' && saldoDe(c) > 0.009);

  const ordenAplicacion = cuotaIdElegida
    ? pendientes.filter((c) => c.id === cuotaIdElegida)
    : [...pendientes].sort((a, b) => {
        const aVencida = estadoVisualCuota({ ...a, importe_original: a.importe_original, importe_pagado: a.importe_pagado }, hoy) === 'vencida' || estadoVisualCuota(a, hoy) === 'parcial_y_vencida';
        const bVencida = estadoVisualCuota(b, hoy) === 'vencida' || estadoVisualCuota(b, hoy) === 'parcial_y_vencida';
        if (aVencida !== bVencida) return aVencida ? -1 : 1; // vencidas primero
        return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento); // luego, más antigua primero
      });

  const asignaciones: AsignacionPago[] = [];
  for (const c of ordenAplicacion) {
    if (restante <= 0.009) break;
    const saldo = saldoDe(c);
    const aplicado = redondear(Math.min(saldo, restante), decimales);
    if (aplicado <= 0.009) continue;
    asignaciones.push({ cuota_id: c.id, monto: aplicado });
    restante = redondear(restante - aplicado, decimales);
  }

  return { asignaciones, sobrante: Math.max(0, restante) };
}

// ---------- Proyección mensual de cobranzas ----------
export type CuotaProyeccion = {
  cliente_id: string;
  moneda: string;
  fecha_vencimiento: string; // YYYY-MM-DD
  importe_original: number;
  importe_pagado: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
};

// Pagos aplicados a cuotas, por FECHA REAL en la que entró el dinero (no la
// fecha de vencimiento de la cuota) — así un pago anticipado se contabiliza
// en el mes en que realmente se cobró, no en el mes futuro al que pertenece
// la cuota (ver ejemplo obligatorio de la spec).
export type PagoAplicadoProyeccion = {
  cliente_id: string;
  moneda: string;
  fecha_pago: string; // YYYY-MM-DD
  monto: number;
};

export type MesProyeccion = {
  mes: string; // YYYY-MM
  moneda: string;
  programado: number; // Σ importe_original de cuotas cuyo vencimiento cae en el mes
  cobrado: number; // Σ pagos aplicados con fecha_pago real en el mes
  pendiente: number; // programado del mes - lo de esas cuotas ya cobrado (nunca negativo)
  vencido: number; // saldo impago de cuotas de ESTE mes cuyo vencimiento ya pasó
  cantidadCuotas: number;
  cantidadClientes: number;
};

function mesDe(fechaISO: string): string {
  return fechaISO.slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'
}

// Una sola función de dominio para el gráfico Y la tabla, para que nunca
// puedan mostrar números distintos entre sí (misma fuente de datos).
export function proyeccionMensual(params: {
  cuotas: CuotaProyeccion[];
  pagosAplicados: PagoAplicadoProyeccion[];
  horizonteMeses: number;
  hoy: Date;
  decimales: number;
}): MesProyeccion[] {
  const { cuotas, pagosAplicados, horizonteMeses, hoy, decimales } = params;
  const hoyMedianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const hoyISO = aFechaISO(hoyMedianoche);

  const meses: { clave: string; moneda: string }[] = [];
  const monedas = Array.from(new Set(cuotas.filter((c) => c.estado !== 'anulada').map((c) => c.moneda)));
  for (const moneda of monedas) {
    for (let i = 0; i < horizonteMeses; i++) {
      const d = sumarMesConClamp(hoyMedianoche, i);
      meses.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, moneda });
    }
  }

  return meses.map(({ clave, moneda }) => {
    const cuotasDelMes = cuotas.filter((c) => c.estado !== 'anulada' && c.moneda === moneda && mesDe(c.fecha_vencimiento) === clave);
    const programado = redondear(
      cuotasDelMes.reduce((acc, c) => acc + c.importe_original, 0),
      decimales
    );
    const cobrado = redondear(
      pagosAplicados
        .filter((p) => p.moneda === moneda && mesDe(p.fecha_pago) === clave)
        .reduce((acc, p) => acc + p.monto, 0),
      decimales
    );
    // "Pendiente" es lo que falta cobrar de las cuotas DE ESTE MES puntual
    // (no lo mismo que "programado − cobrado del mes", porque un pago
    // anticipado de una cuota futura se contabiliza como "cobrado" en el mes
    // en que se pagó, no en el mes de la cuota — así que acá se calcula
    // directo desde el saldo real de esas cuotas).
    const pendiente = redondear(
      cuotasDelMes.reduce((acc, c) => acc + Math.max(0, c.importe_original - c.importe_pagado), 0),
      decimales
    );
    const vencido = redondear(
      cuotasDelMes
        .filter((c) => c.fecha_vencimiento < hoyISO)
        .reduce((acc, c) => acc + Math.max(0, c.importe_original - c.importe_pagado), 0),
      decimales
    );
    const cantidadClientes = new Set(cuotasDelMes.map((c) => c.cliente_id)).size;

    return { mes: clave, moneda, programado, cobrado, pendiente, vencido, cantidadCuotas: cuotasDelMes.length, cantidadClientes };
  });
}

// Porcentaje cobrado del mes actual, evitando división por cero.
export function porcentajeCobrado(programado: number, cobrado: number): number | null {
  if (programado <= 0.009) return null;
  return redondear((cobrado / programado) * 100, 1);
}

// ---------- Alertas de vencimiento (internas, sin correo/WhatsApp) ----------
// Mismo criterio que calcularAlertas() de Servicio Técnico
// (app/lib/reparaciones.ts): función pura que devuelve una lista, la UI la
// filtra contra un set de "descartadas" en localStorage (no hay tabla de
// alertas en la base, así que "descartar" es una preferencia del
// navegador, no un cambio de estado real).
export type CategoriaAlertaCuota = 'vence_hoy' | 'proxima_a_vencer' | 'vencida';
export type AlertaCuota = {
  id: string; // = cuota_id, único por diseño → nunca se duplica
  categoria: CategoriaAlertaCuota;
  clienteId: string;
  clienteNombre: string;
  planId: string;
  cuotaNumero: number;
  cuotaTotal: number;
  importe: number;
  moneda: string;
  fechaVencimiento: string;
  diasAtraso: number | null;
};

export function alertasCuotas(
  cuotas: (CuotaEstado & { id: string; cliente_id: string; clienteNombre: string; plan_id: string; numero: number; cuotaTotal: number; moneda: string })[],
  hoy: Date
): AlertaCuota[] {
  const hoyMedianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const alertas: AlertaCuota[] = [];
  for (const c of cuotas) {
    const visual = estadoVisualCuota(c, hoy);
    if (visual !== 'vence_hoy' && visual !== 'proxima_a_vencer' && visual !== 'vencida' && visual !== 'parcial_y_vencida') continue;
    const categoria: CategoriaAlertaCuota = visual === 'proxima_a_vencer' ? 'proxima_a_vencer' : visual === 'vence_hoy' ? 'vence_hoy' : 'vencida';
    const vencimiento = fechaLocal(c.fecha_vencimiento);
    const diasAtraso = categoria === 'vencida' ? Math.round((hoyMedianoche.getTime() - vencimiento.getTime()) / 86400000) : null;
    alertas.push({
      id: c.id,
      categoria,
      clienteId: c.cliente_id,
      clienteNombre: c.clienteNombre,
      planId: c.plan_id,
      cuotaNumero: c.numero,
      cuotaTotal: c.cuotaTotal,
      importe: redondear(c.importe_original - c.importe_pagado, 2),
      moneda: c.moneda,
      fechaVencimiento: c.fecha_vencimiento,
      diasAtraso,
    });
  }
  // Vencidas primero (las más atrasadas arriba), después vence-hoy, después
  // próximas a vencer — mismo criterio de prioridad que aplicarPagoACuotas.
  const orden: Record<CategoriaAlertaCuota, number> = { vencida: 0, vence_hoy: 1, proxima_a_vencer: 2 };
  return alertas.sort((a, b) => orden[a.categoria] - orden[b.categoria] || (b.diasAtraso ?? 0) - (a.diasAtraso ?? 0) || a.fechaVencimiento.localeCompare(b.fechaVencimiento));
}
