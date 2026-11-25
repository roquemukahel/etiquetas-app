// ============================================================
// Puente con Supabase para Qovi — SOLO se usa desde el servidor
// (app/api/qovi/chat/route.ts), nunca desde el navegador: acá se resuelve
// el negocio real del usuario autenticado, se cuentan consultas para el
// rate limit, se busca en la base de conocimiento y se guarda la
// conversación y el uso. La lógica de decisión (filtros, límites, costos)
// vive aparte, pura, en los otros archivos de esta carpeta.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ArticuloQovi } from './busqueda';
import type { ModuloQovi } from './modulos';
import { registrarFallo } from '../escritura';

export type UsuarioQovi = { negocioId: string; usuarioId: string };

// El mismo join que ya usa el resto de la app (ver app/ingresos/page.tsx) para
// pasar de un usuario autenticado de Supabase a su negocio.
export async function resolverUsuario(supabase: SupabaseClient): Promise<UsuarioQovi | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('perfiles').select('negocio_id').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  return { negocioId: (data as { negocio_id: string }).negocio_id, usuarioId: user.id };
}

export async function obtenerConfiguracion(supabase: SupabaseClient, negocioId: string): Promise<{ habilitado: boolean; limiteDiario: number | null }> {
  const { data, error } = await supabase.from('qovi_configuracion').select('habilitado, limite_diario').eq('negocio_id', negocioId).maybeSingle();
  if (error) registrarFallo(error, 'leer qovi_configuracion');
  // Sin fila todavía (el superadmin no lo habilitó para este negocio) o fallo de lectura: Qovi se mantiene
  // apagado — "fail closed", a propósito, mientras esto sea una función experimental opt-in por negocio.
  if (error || !data) return { habilitado: false, limiteDiario: null };
  return { habilitado: (data as any).habilitado, limiteDiario: (data as any).limite_diario };
}

export async function contarConsultasDesde(supabase: SupabaseClient, negocioId: string, desde: Date): Promise<number> {
  const { count, error } = await supabase
    .from('qovi_uso')
    .select('id', { count: 'exact', head: true })
    .eq('negocio_id', negocioId)
    .gte('creado_en', desde.toISOString());
  if (error) return 0; // si falla el conteo, no bloqueamos por un problema de lectura — se prioriza no romper la experiencia sobre el límite
  return count ?? 0;
}

// websearch_to_tsquery exige que TODAS las palabras significativas de la
// pregunta coincidan (AND) — pero "hago" (pregunta) y "hacer" (artículo) no
// comparten raíz en el stemmer en español, así que una pregunta tan directa
// como "¿Cómo hago una venta?" no encontraba el artículo aunque "venta" sí
// matcheaba. Se arma la consulta a mano con OR entre palabras: alcanza con
// que matchee una palabra significativa, no todas.
function construirConsultaBusqueda(consulta: string): string {
  const palabras = consulta
    .split(/[^\p{L}\p{N}]+/u)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  return palabras.join(' | ');
}

export async function buscarArticulos(supabase: SupabaseClient, consulta: string, moduloActual: ModuloQovi): Promise<ArticuloQovi[]> {
  const consultaTs = construirConsultaBusqueda(consulta);
  if (!consultaTs) return [];
  const { data, error } = await supabase
    .from('qovi_articulos')
    .select('id, titulo, slug, modulo, contenido, roles_autorizados, acciones_navegacion, ruta_relacionada')
    .eq('estado', 'publicado')
    .textSearch('busqueda', consultaTs, { config: 'spanish' })
    .limit(10);
  if (error || !data) return [];
  return data as ArticuloQovi[];
}

export async function obtenerOCrearConversacion(
  supabase: SupabaseClient,
  params: { conversacionId?: string; negocioId: string; actorNombre: string | null; actorTipo: string | null; moduloInicial: ModuloQovi }
): Promise<string | null> {
  if (params.conversacionId) {
    const { data, error } = await supabase.from('qovi_conversaciones').select('id').eq('id', params.conversacionId).eq('negocio_id', params.negocioId).maybeSingle();
    if (error) registrarFallo(error, 'buscar conversación existente de qovi');
    if (data) return (data as { id: string }).id;
    // Si vino un conversacionId que no es de este negocio (o ya no existe), o falló la lectura, se crea una nueva en vez de bloquear la consulta.
  }
  const { data, error } = await supabase
    .from('qovi_conversaciones')
    .insert({ actor_nombre: params.actorNombre, actor_tipo: params.actorTipo, modulo_inicial: params.moduloInicial })
    .select('id')
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export type MensajeHistorial = { rol: 'user' | 'assistant'; contenido: string };

export async function obtenerHistorialReciente(supabase: SupabaseClient, conversacionId: string, limite: number): Promise<MensajeHistorial[]> {
  const { data, error } = await supabase
    .from('qovi_mensajes')
    .select('rol, contenido, creado_en')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return (data as MensajeHistorial[]).reverse();
}

export async function guardarMensaje(
  supabase: SupabaseClient,
  params: { conversacionId: string; rol: 'user' | 'assistant'; contenido: string; fuentes?: unknown; acciones?: unknown; sugerencias?: unknown; confianza?: string; escalar?: boolean }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('qovi_mensajes')
    .insert({
      conversacion_id: params.conversacionId,
      rol: params.rol,
      contenido: params.contenido,
      fuentes: params.fuentes ?? [],
      acciones: params.acciones ?? [],
      sugerencias: params.sugerencias ?? [],
      confianza: params.confianza ?? null,
      escalar: params.escalar ?? false,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function registrarUso(
  supabase: SupabaseClient,
  params: {
    moduloActual: string;
    modelo: string | null;
    tokensEntrada: number;
    tokensSalida: number;
    tokensCache: number;
    costoEstimado: number;
    duracionMs: number;
    estado: 'ok' | 'error' | 'rate_limited' | 'sin_info' | 'deshabilitado';
  }
): Promise<void> {
  const { error } = await supabase.from('qovi_uso').insert({
    modulo_actual: params.moduloActual,
    modelo: params.modelo,
    tokens_entrada: params.tokensEntrada,
    tokens_salida: params.tokensSalida,
    tokens_cache: params.tokensCache,
    costo_estimado: params.costoEstimado,
    duracion_ms: params.duracionMs,
    estado: params.estado,
  });
  // No bloquea la respuesta al usuario si falla (es solo el registro de costos/uso) — pero queda la traza.
  if (error) registrarFallo(error, 'qovi_uso insert');
}
