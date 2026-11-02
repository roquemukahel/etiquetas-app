// Seguimiento público de una orden de Servicio Técnico para otra app (/orden-publica/<código>/json) y avisos push.
// Solo sale lo que ve el cliente: equipo, color, trabajo, estado, nota, presupuesto e historial de estados. NUNCA datos del
// cliente, IMEI, código de desbloqueo, costos, diagnóstico interno ni notas internas.

// 8 caracteres sin los que se confunden al leerlos o dictarlos (sin I, O, 0 ni 1): 32 símbolos, ~1,1 billones de códigos.
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FORMATO_CODIGO = /^[A-HJ-NP-Z2-9]{8}$/;

// El que escribe el código a mano puede usar minúsculas o espacios: se acepta igual.
export function normalizarCodigo(crudo: string | null | undefined): string | null {
  const codigo = (crudo ?? '').trim().toUpperCase();
  return FORMATO_CODIGO.test(codigo) ? codigo : null;
}

// La app que lo lee desde un navegador de otro dominio necesita estos permisos (CORS) y que nada se guarde en caché.
export const CABECERAS_ORDEN_PUBLICA: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

export const MAX_CONSULTAS_POR_MINUTO = 60;
export const MAX_TOKENS_PUSH_POR_ORDEN = 10;

export type EstadoPublico = 'recibido' | 'diagnostico' | 'esperando_repuesto' | 'reparando' | 'listo' | 'entregado' | 'cancelado';

// Los estados internos son más finos que los que ve el cliente: "esperando aprobación" también es parte del diagnóstico.
const ESTADO_PUBLICO: Record<string, EstadoPublico> = {
  recibido: 'recibido',
  esperando_diagnostico: 'diagnostico',
  esperando_aprobacion: 'diagnostico',
  esperando_repuesto: 'esperando_repuesto',
  en_reparacion: 'reparando',
  listo_para_entregar: 'listo',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

export function estadoPublico(estadoInterno: string | null | undefined): EstadoPublico {
  return ESTADO_PUBLICO[estadoInterno ?? ''] ?? 'recibido';
}

export type FilaOrdenPublica = {
  modelo: string | null;
  color: string | null;
  estado: string;
  trabajo_recomendado: string | null;
  trabajos_realizados: string[] | null;
  falla_declarada: string | null;
  nota_cliente: string | null;
  presupuesto_mano_obra: number | string | null;
  presupuesto_repuestos: number | string | null;
  importe_total: number | string | null;
  seguimiento_actualizado_at: string | null;
  estado_actualizado_at: string | null;
  created_at: string;
};

export type FilaHistorialEstado = { estado: string; created_at: string };

export type OrdenPublicaJson = {
  codigo: string;
  equipo: string | null;
  color: string | null;
  trabajo: string | null;
  estado: EstadoPublico;
  nota_cliente: string | null;
  presupuesto: number | null;
  moneda: string;
  historial: { estado: EstadoPublico; fecha: string }[];
  actualizado: string;
};

const aNumero = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const aTextoONull = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

const aIso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

// Lo que se hace al equipo: primero lo ya realizado, si no lo recomendado, y si todavía no hay diagnóstico, la falla que contó el cliente.
export function trabajoPublico(f: Pick<FilaOrdenPublica, 'trabajos_realizados' | 'trabajo_recomendado' | 'falla_declarada'>): string | null {
  const hechos = (f.trabajos_realizados ?? []).map((t) => t.trim()).filter(Boolean);
  if (hechos.length > 0) return hechos.join(', ');
  return aTextoONull(f.trabajo_recomendado) ?? aTextoONull(f.falla_declarada);
}

// Presupuesto = mano de obra + repuestos; si todavía no se presupuestó, el importe final si ya lo hay.
export function presupuestoPublico(f: Pick<FilaOrdenPublica, 'presupuesto_mano_obra' | 'presupuesto_repuestos' | 'importe_total'>): number | null {
  const manoDeObra = aNumero(f.presupuesto_mano_obra);
  const repuestos = aNumero(f.presupuesto_repuestos);
  if (manoDeObra != null || repuestos != null) return (manoDeObra ?? 0) + (repuestos ?? 0);
  const total = aNumero(f.importe_total);
  return total != null && total > 0 ? total : null;
}

// Historial en el vocabulario del cliente, de más viejo a más nuevo, sin repetir dos veces seguidas el mismo estado
// (pasar de "esperando diagnóstico" a "esperando aprobación" son dos estados internos pero uno solo para el cliente).
export function historialPublico(filas: FilaHistorialEstado[]): { estado: EstadoPublico; fecha: string }[] {
  const ordenadas = [...filas].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const resultado: { estado: EstadoPublico; fecha: string }[] = [];
  for (const fila of ordenadas) {
    const fecha = aIso(fila.created_at);
    if (!fecha) continue;
    const estado = estadoPublico(fila.estado);
    if (resultado.length > 0 && resultado[resultado.length - 1].estado === estado) continue;
    resultado.push({ estado, fecha });
  }
  return resultado;
}

export function armarOrdenPublicaJson(
  codigo: string,
  fila: FilaOrdenPublica,
  moneda: string,
  historial: FilaHistorialEstado[]
): OrdenPublicaJson {
  const registros = historialPublico(historial);
  const estado = estadoPublico(fila.estado);
  // El último paso del historial tiene que ser el estado de hoy; si faltara (orden vieja sin registro) se agrega.
  if (registros.length === 0 || registros[registros.length - 1].estado !== estado) {
    registros.push({ estado, fecha: aIso(fila.estado_actualizado_at) ?? aIso(fila.created_at) ?? new Date().toISOString() });
  }
  return {
    codigo,
    equipo: aTextoONull(fila.modelo),
    color: aTextoONull(fila.color),
    trabajo: trabajoPublico(fila),
    estado,
    nota_cliente: aTextoONull(fila.nota_cliente),
    presupuesto: presupuestoPublico(fila),
    moneda,
    historial: registros,
    actualizado: aIso(fila.seguimiento_actualizado_at) ?? aIso(fila.estado_actualizado_at) ?? aIso(fila.created_at) ?? new Date().toISOString(),
  };
}

// --- Avisos push (Expo) ---

// Los tokens de Expo tienen esta forma: ExponentPushToken[...] (o ExpoPushToken[...] en versiones nuevas).
export const FORMATO_TOKEN_EXPO = /^(Exponent|Expo)PushToken\[[A-Za-z0-9_.-]{1,100}\]$/;

export function esTokenExpoValido(token: unknown): token is string {
  return typeof token === 'string' && FORMATO_TOKEN_EXPO.test(token);
}

// Estados que avisan al cliente. "Recibido" y "diagnóstico" no (el cliente ya lo sabe o es muy temprano) y "cancelado" tampoco.
export const ESTADOS_QUE_AVISAN: EstadoPublico[] = ['listo', 'reparando', 'esperando_repuesto', 'entregado'];
// Al llegar a uno de estos la orden se cierra: después de avisar (o no) se dejan de guardar sus tokens.
export const ESTADOS_QUE_CIERRAN: EstadoPublico[] = ['entregado', 'cancelado'];

export type TextoPush = { title: string; body: string };

export function textoPush(
  estado: EstadoPublico,
  equipo: string | null,
  negocio: { nombre: string; direccion: string | null }
): TextoPush | null {
  const nombreEquipo = aTextoONull(equipo) ?? 'equipo';
  const lugar = aTextoONull(negocio.direccion) ? `${negocio.nombre}, ${negocio.direccion!.trim()}` : negocio.nombre;
  switch (estado) {
    case 'listo':
      return { title: '¡Tu equipo está listo! 🎉', body: `Tu ${nombreEquipo} ya está listo para retirar en ${lugar}.` };
    case 'reparando':
      return { title: `Estamos reparando tu ${nombreEquipo}`, body: 'Te avisamos apenas esté listo.' };
    case 'esperando_repuesto':
      return { title: 'Esperando repuesto', body: `Estamos esperando el repuesto para tu ${nombreEquipo}.` };
    case 'entregado':
      return { title: `¡Gracias por elegir ${negocio.nombre}!`, body: 'Cualquier cosa, escribinos.' };
    default:
      return null;
  }
}

export type MensajePush = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: { codigo: string; estado: EstadoPublico };
};

export function armarMensajesPush(tokens: string[], codigo: string, estado: EstadoPublico, texto: TextoPush): MensajePush[] {
  return tokens.map((to) => ({ to, sound: 'default', title: texto.title, body: texto.body, data: { codigo, estado } }));
}

// Expo contesta un "ticket" por mensaje, en el mismo orden. Los que dicen DeviceNotRegistered son equipos que desinstalaron la
// app: ese token ya no sirve y hay que borrarlo.
export function tokensNoRegistrados(tokens: string[], respuesta: unknown): string[] {
  const data = (respuesta as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const invalidos: string[] = [];
  data.forEach((ticket, i) => {
    const t = ticket as { status?: string; details?: { error?: string } } | null;
    if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered' && tokens[i]) invalidos.push(tokens[i]);
  });
  return invalidos;
}
