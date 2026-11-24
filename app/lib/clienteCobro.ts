// Datos de cobro de un cliente (clientes_cobro_supabase.sql): de qué cobra, qué día, en qué rango pactó pagar y cómo lo calificamos.
// Todo es opcional: un cliente sin estos datos se comporta exactamente como siempre.

export const FUENTES_INGRESO = [
  { clave: 'empleado_estatal', etiqueta: 'Empleado estatal' },
  { clave: 'empleado_privado', etiqueta: 'Empleado privado' },
  { clave: 'jubilacion_pension', etiqueta: 'Jubilación/Pensión' },
  { clave: 'auh_asignacion', etiqueta: 'AUH/Asignación' },
  { clave: 'independiente', etiqueta: 'Independiente/Monotributo' },
  { clave: 'otro', etiqueta: 'Otro' },
] as const;
export type FuenteIngreso = (typeof FUENTES_INGRESO)[number]['clave'];

// Las fuentes que cobran según la terminación del DNI (cronograma de ANSES).
export const FUENTES_CON_CRONOGRAMA: string[] = ['jubilacion_pension', 'auh_asignacion'];

export const RANGOS_PAGO = ['1-5', '5-10', '10-15', '15-25', '25-30'] as const;

export const CALIFICACIONES = [
  { clave: 'bueno', etiqueta: 'Bueno' },
  { clave: 'regular', etiqueta: 'Regular' },
  { clave: 'riesgoso', etiqueta: 'Riesgoso' },
] as const;
export type Calificacion = (typeof CALIFICACIONES)[number]['clave'];

export const etiquetaFuente = (clave: string | null | undefined): string => FUENTES_INGRESO.find((f) => f.clave === clave)?.etiqueta ?? '';
export const etiquetaCalificacion = (clave: string | null | undefined): string => CALIFICACIONES.find((c) => c.clave === clave)?.etiqueta ?? '';

export type DatosCobro = {
  fuente_ingreso?: string | null;
  dia_cobro?: number | null;
  rango_pago?: string | null;
  calificacion?: string | null;
  observaciones_cobro?: string | null;
};

// fuente → terminación de DNI (0-9) → día del mes en que cobra.
export type Cronograma = Record<string, Record<number, number>>;

export function armarCronograma(filas: { fuente: string; terminacion: number; dia: number }[]): Cronograma {
  const c: Cronograma = {};
  for (const f of filas) (c[f.fuente] ??= {})[Number(f.terminacion)] = Number(f.dia);
  return c;
}

// Último dígito del DNI (ignorando puntos y espacios); null si no hay.
export function terminacionDni(dni: string | null | undefined): number | null {
  const digitos = (dni ?? '').replace(/\D/g, '');
  return digitos ? Number(digitos[digitos.length - 1]) : null;
}

// Día del mes en que cobra el cliente: el que se cargó a mano, o si no, el del cronograma según su fuente y la terminación del DNI.
export function diaDeCobro(
  c: { dia_cobro?: number | null; fuente_ingreso?: string | null; dni?: string | null },
  cronograma?: Cronograma | null
): { dia: number; origen: 'manual' | 'cronograma' } | null {
  if (c.dia_cobro != null && c.dia_cobro >= 1 && c.dia_cobro <= 31) return { dia: c.dia_cobro, origen: 'manual' };
  if (c.fuente_ingreso && FUENTES_CON_CRONOGRAMA.includes(c.fuente_ingreso) && cronograma) {
    const term = terminacionDni(c.dni);
    const dia = term != null ? cronograma[c.fuente_ingreso]?.[term] : undefined;
    if (dia != null) return { dia, origen: 'cronograma' };
  }
  return null;
}

// "Ya cobró – no pagó": ya pasó el día de cobro de este mes, todavía debe la cuota del mes (algo ya vencido, o un vencimiento que cae
// este mes) y no registró ningún pago desde el 1º. Un día de cobro 31 en un mes de 30 días cuenta como el último día del mes.
export function yaCobroNoPago(p: {
  diaCobro: number | null;
  hoy: Date;
  saldo: number;
  vencido: number;
  proximoVencimiento: string | null; // AAAA-MM-DD
  pagoEsteMes: boolean;
}): boolean {
  if (p.diaCobro == null || p.pagoEsteMes || p.saldo <= 0.009) return false;
  const ultimoDia = new Date(p.hoy.getFullYear(), p.hoy.getMonth() + 1, 0).getDate();
  const dia = Math.min(p.diaCobro, ultimoDia);
  if (p.hoy.getDate() <= dia) return false;
  if (p.vencido > 0.009) return true;
  if (!p.proximoVencimiento) return false;
  const finDeMes = `${p.hoy.getFullYear()}-${String(p.hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return p.proximoVencimiento <= finDeMes;
}

// ---- Filtros compartidos por Clientes y Cuentas por cobrar ----
export const SIN_SUCURSAL = '__sin_sucursal__';

export type FiltrosCliente = {
  sucursal: string; // '' = todas, SIN_SUCURSAL, o el id de la sucursal de origen
  fuente: string;
  rango: string;
  calificacion: string;
  soloYaCobroNoPago: boolean;
};

export const FILTROS_VACIOS: FiltrosCliente = { sucursal: '', fuente: '', rango: '', calificacion: '', soloYaCobroNoPago: false };

export function coincideSucursal(origenId: string | null | undefined, filtro: string): boolean {
  if (!filtro) return true;
  if (filtro === SIN_SUCURSAL) return !origenId;
  return origenId === filtro;
}

export function coincideDatosCobro(c: DatosCobro & { sucursal_origen_id?: string | null }, f: Pick<FiltrosCliente, 'sucursal' | 'fuente' | 'rango' | 'calificacion'>): boolean {
  if (!coincideSucursal(c.sucursal_origen_id, f.sucursal)) return false;
  if (f.fuente && c.fuente_ingreso !== f.fuente) return false;
  if (f.rango && c.rango_pago !== f.rango) return false;
  if (f.calificacion && c.calificacion !== f.calificacion) return false;
  return true;
}
