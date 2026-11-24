// ============================================================
// Forma validada de lo que Qovi devuelve, y el parser defensivo que
// convierte el texto crudo del modelo en esa forma — o en un fallback
// seguro si vino inválido. Pura: no toca red ni base de datos, así se
// testea con strings de ejemplo.
// ============================================================
import { resolverAcciones, type ClaveAccionQovi } from './acciones';

export type ConfianzaQovi = 'alta' | 'media' | 'baja';

export type FuenteQovi = { slug: string; titulo: string };
export type AccionQovi = { clave: ClaveAccionQovi; etiqueta: string; href: string };

export type RespuestaQovi = {
  answer: string;
  sources: FuenteQovi[];
  suggestedQuestions: string[];
  actions: AccionQovi[];
  confidence: ConfianzaQovi;
  escalationSuggested: boolean;
};

export const RESPUESTA_SIN_INFO: Omit<RespuestaQovi, 'sources' | 'actions' | 'suggestedQuestions'> = {
  answer: 'No pude encontrar información suficiente para responderte con seguridad. Podés reformular la consulta o comunicarte con soporte.',
  confidence: 'baja',
  escalationSuggested: true,
};

export const RESPUESTA_ERROR: Omit<RespuestaQovi, 'sources' | 'actions' | 'suggestedQuestions'> = {
  answer: 'Tuve un problema para responder. Probá de nuevo en un momento.',
  confidence: 'baja',
  escalationSuggested: false,
};

export const RESPUESTA_LIMITE: Omit<RespuestaQovi, 'sources' | 'actions' | 'suggestedQuestions'> = {
  answer: 'Llegaste al límite de consultas de hoy para Qovi. Probá de nuevo mañana, o comunicate con soporte si es urgente.',
  confidence: 'baja',
  escalationSuggested: true,
};

export const RESPUESTA_DESHABILITADO: Omit<RespuestaQovi, 'sources' | 'actions' | 'suggestedQuestions'> = {
  answer: 'Qovi no está disponible en este momento.',
  confidence: 'baja',
  escalationSuggested: false,
};

function vacia(base: Omit<RespuestaQovi, 'sources' | 'actions' | 'suggestedQuestions'>): RespuestaQovi {
  return { ...base, sources: [], actions: [], suggestedQuestions: [] };
}

// Fuentes reales que de verdad se mandaron como contexto — nunca se confía
// en que el modelo "invente" bien un slug: se cruza contra la lista de
// artículos que efectivamente se le pasaron.
export function parsearRespuestaModelo(
  textoCrudo: string,
  articulosDisponibles: { slug: string; titulo: string }[]
): RespuestaQovi {
  let datos: any;
  try {
    const limpio = textoCrudo.replace(/```json|```/g, '').trim();
    datos = JSON.parse(limpio);
  } catch {
    return vacia(RESPUESTA_ERROR);
  }
  if (!datos || typeof datos !== 'object' || typeof datos.answer !== 'string' || !datos.answer.trim()) {
    return vacia(RESPUESTA_ERROR);
  }

  const porSlug = new Map(articulosDisponibles.map((a) => [a.slug, a.titulo]));
  const fuentes: FuenteQovi[] = Array.isArray(datos.sources)
    ? datos.sources.filter((s: unknown): s is string => typeof s === 'string' && porSlug.has(s)).map((slug: string) => ({ slug, titulo: porSlug.get(slug)! }))
    : [];

  const sugerencias: string[] = Array.isArray(datos.suggestedQuestions)
    ? datos.suggestedQuestions.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4)
    : [];

  const confianzasValidas: ConfianzaQovi[] = ['alta', 'media', 'baja'];
  const confidence: ConfianzaQovi = confianzasValidas.includes(datos.confidence) ? datos.confidence : 'media';

  return {
    answer: datos.answer.trim(),
    sources: fuentes,
    suggestedQuestions: sugerencias,
    actions: resolverAcciones(datos.actions),
    confidence,
    escalationSuggested: datos.escalationSuggested === true,
  };
}

export function respuestaSinInfo(): RespuestaQovi {
  return vacia(RESPUESTA_SIN_INFO);
}
export function respuestaError(): RespuestaQovi {
  return vacia(RESPUESTA_ERROR);
}
export function respuestaLimiteAlcanzado(): RespuestaQovi {
  return vacia(RESPUESTA_LIMITE);
}
export function respuestaDeshabilitado(): RespuestaQovi {
  return vacia(RESPUESTA_DESHABILITADO);
}
