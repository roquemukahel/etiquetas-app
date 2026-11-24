import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { crearClienteServidor } from '../../../lib/supabase/server';
import { QOVI_ENABLED, QOVI_MODEL, QOVI_MODEL_ALTERNATIVO, QOVI_MAX_OUTPUT_TOKENS, QOVI_TIMEOUT_MS, QOVI_VENTANA_HISTORIAL, QOVI_MIN_FRAGMENTOS_PARA_RESPONDER } from '../../../lib/qovi/config';
import { validarMensaje, pareceIntentoDeInyeccion } from '../../../lib/qovi/seguridad';
import { superaLimitePorMinuto, superaLimiteDiario } from '../../../lib/qovi/limites';
import { esModuloValido, type ModuloQovi } from '../../../lib/qovi/modulos';
import { esRolValido, type RolQovi } from '../../../lib/qovi/rol';
import { filtrarYPriorizarArticulos } from '../../../lib/qovi/busqueda';
import { construirInstruccionesEstaticas, construirContextoDinamico } from '../../../lib/qovi/prompt';
import { parsearRespuestaModelo, respuestaSinInfo, respuestaError, respuestaLimiteAlcanzado, respuestaDeshabilitado, type RespuestaQovi } from '../../../lib/qovi/respuesta';
import { costoEstimadoUsd } from '../../../lib/qovi/costos';
import {
  resolverUsuario,
  obtenerConfiguracion,
  contarConsultasDesde,
  buscarArticulos,
  obtenerOCrearConversacion,
  obtenerHistorialReciente,
  guardarMensaje,
  registrarUso,
} from '../../../lib/qovi/servicio';

// Esta clave nunca se expone al navegador — vive solo acá, en el servidor
// (mismo criterio que app/api/extract-device-info).
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type CuerpoPedido = {
  mensaje?: unknown;
  moduloActual?: unknown;
  rolActual?: unknown;
  conversacionId?: unknown;
  actorNombre?: unknown;
  actorTipo?: unknown;
};

function responderQovi(status: number, respuesta: RespuestaQovi, extra?: Record<string, unknown>) {
  return NextResponse.json({ respuesta, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const supabase = crearClienteServidor();

  if (!QOVI_ENABLED || !process.env.ANTHROPIC_API_KEY) {
    // Sin la clave configurada la app sigue andando igual — Qovi simplemente
    // se muestra deshabilitado, nunca rompe el resto del sistema.
    return responderQovi(200, respuestaDeshabilitado());
  }

  const usuario = await resolverUsuario(supabase);
  if (!usuario) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let cuerpo: CuerpoPedido;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const validacion = validarMensaje(cuerpo.mensaje);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.motivo }, { status: 400 });
  }
  const mensaje = validacion.texto;

  const moduloActual: ModuloQovi = esModuloValido(cuerpo.moduloActual) ? cuerpo.moduloActual : 'general';
  // Rol recibido del cliente, con el mismo nivel de confianza que el resto de
  // la app (ver rol.ts) — ante cualquier duda, el default es el más
  // restringido (vendedor), nunca administrador.
  const rolActual: RolQovi = esRolValido(cuerpo.rolActual) ? cuerpo.rolActual : 'vendedor';
  const conversacionId = typeof cuerpo.conversacionId === 'string' ? cuerpo.conversacionId : undefined;
  const actorNombre = typeof cuerpo.actorNombre === 'string' ? cuerpo.actorNombre.slice(0, 120) : null;
  const actorTipo = typeof cuerpo.actorTipo === 'string' ? cuerpo.actorTipo.slice(0, 40) : null;

  const configuracion = await obtenerConfiguracion(supabase, usuario.negocioId);
  if (!configuracion.habilitado) {
    return responderQovi(200, respuestaDeshabilitado());
  }

  // Defensa determinística contra prompt injection — ni siquiera se llama a
  // Claude para estos casos (ver seguridad.ts para las frases detectadas).
  if (pareceIntentoDeInyeccion(mensaje)) {
    const respuesta: RespuestaQovi = {
      answer: 'Solo puedo ayudarte con el uso de Qovento. No puedo mostrar instrucciones internas, variables de entorno ni información de otros negocios.',
      sources: [],
      suggestedQuestions: [],
      actions: [],
      confidence: 'alta',
      escalationSuggested: false,
    };
    await registrarUso(supabase, {
      moduloActual,
      modelo: null,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimado: 0,
      duracionMs: Date.now() - inicio,
      estado: 'ok',
    });
    return responderQovi(200, respuesta);
  }

  const ahora = new Date();
  const hace1Minuto = new Date(ahora.getTime() - 60_000);
  const hoyDesdeMedianoche = new Date(ahora);
  hoyDesdeMedianoche.setHours(0, 0, 0, 0);

  const [consultasUltimoMinuto, consultasHoy] = await Promise.all([
    contarConsultasDesde(supabase, usuario.negocioId, hace1Minuto),
    contarConsultasDesde(supabase, usuario.negocioId, hoyDesdeMedianoche),
  ]);

  if (superaLimitePorMinuto(consultasUltimoMinuto) || superaLimiteDiario(consultasHoy, configuracion.limiteDiario)) {
    await registrarUso(supabase, {
      moduloActual,
      modelo: null,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimado: 0,
      duracionMs: Date.now() - inicio,
      estado: 'rate_limited',
    });
    return responderQovi(429, respuestaLimiteAlcanzado());
  }

  const encontrados = await buscarArticulos(supabase, mensaje, moduloActual);
  const articulos = filtrarYPriorizarArticulos(encontrados, rolActual, moduloActual);

  const conversacionIdFinal = await obtenerOCrearConversacion(supabase, {
    conversacionId,
    negocioId: usuario.negocioId,
    actorNombre,
    actorTipo,
    moduloInicial: moduloActual,
  });

  if (articulos.length < QOVI_MIN_FRAGMENTOS_PARA_RESPONDER) {
    const respuesta = respuestaSinInfo();
    let mensajeId: string | null = null;
    if (conversacionIdFinal) {
      await guardarMensaje(supabase, { conversacionId: conversacionIdFinal, rol: 'user', contenido: mensaje });
      mensajeId = await guardarMensaje(supabase, {
        conversacionId: conversacionIdFinal,
        rol: 'assistant',
        contenido: respuesta.answer,
        confianza: respuesta.confidence,
        escalar: respuesta.escalationSuggested,
      });
    }
    await registrarUso(supabase, {
      moduloActual,
      modelo: null,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimado: 0,
      duracionMs: Date.now() - inicio,
      estado: 'sin_info',
    });
    return responderQovi(200, respuesta, { conversacionId: conversacionIdFinal, mensajeId });
  }

  const historial = conversacionIdFinal ? await obtenerHistorialReciente(supabase, conversacionIdFinal, QOVI_VENTANA_HISTORIAL) : [];

  const sistema = `${construirInstruccionesEstaticas()}\n\n${construirContextoDinamico(articulos, moduloActual)}`;
  const mensajesClaude = [...historial.map((m) => ({ role: m.rol, content: m.contenido })), { role: 'user' as const, content: mensaje }];
  const fuentesDisponibles = articulos.map((a) => ({ slug: a.slug, titulo: a.titulo }));

  const llamarModelo = async (modelo: string) => {
    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), QOVI_TIMEOUT_MS);
    try {
      const respuestaModelo = await anthropic.messages.create(
        { model: modelo, max_tokens: QOVI_MAX_OUTPUT_TOKENS, system: sistema, messages: mensajesClaude },
        { signal: controlador.signal }
      );
      const textBlock = respuestaModelo.content.find((b) => b.type === 'text');
      const textoCrudo = textBlock && 'text' in textBlock ? textBlock.text : '';
      const usage: any = respuestaModelo.usage;
      return {
        respuesta: parsearRespuestaModelo(textoCrudo, fuentesDisponibles),
        tokensEntrada: usage?.input_tokens ?? 0,
        tokensSalida: usage?.output_tokens ?? 0,
        tokensCache: usage?.cache_read_input_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    // Preguntas que combinan varias fuentes a la vez van directo al modelo
    // superior — Haiku alcanza y sobra para un procedimiento puntual, pero
    // combinar varios pasos de distintos artículos es justo el caso donde
    // conviene más razonamiento. El resto arranca con Haiku (rápido y
    // barato) y solo escala a Sonnet si esa primera respuesta vino con
    // confianza baja — nunca escala dos veces para la misma consulta.
    const esComplejo = articulos.length > 2;
    let intento = await llamarModelo(esComplejo ? QOVI_MODEL_ALTERNATIVO : QOVI_MODEL);
    let modeloUsado = esComplejo ? QOVI_MODEL_ALTERNATIVO : QOVI_MODEL;
    let tokensEntradaTotal = intento.tokensEntrada;
    let tokensSalidaTotal = intento.tokensSalida;
    let tokensCacheTotal = intento.tokensCache;

    if (!esComplejo && intento.respuesta.confidence === 'baja') {
      const reintento = await llamarModelo(QOVI_MODEL_ALTERNATIVO);
      modeloUsado = QOVI_MODEL_ALTERNATIVO;
      tokensEntradaTotal += reintento.tokensEntrada;
      tokensSalidaTotal += reintento.tokensSalida;
      tokensCacheTotal += reintento.tokensCache;
      intento = reintento;
    }

    const respuesta = intento.respuesta;
    const tokensEntrada = tokensEntradaTotal;
    const tokensSalida = tokensSalidaTotal;
    const tokensCache = tokensCacheTotal;
    const costo = costoEstimadoUsd(modeloUsado, tokensEntrada, tokensSalida, tokensCache);

    let mensajeId: string | null = null;
    if (conversacionIdFinal) {
      await guardarMensaje(supabase, { conversacionId: conversacionIdFinal, rol: 'user', contenido: mensaje });
      mensajeId = await guardarMensaje(supabase, {
        conversacionId: conversacionIdFinal,
        rol: 'assistant',
        contenido: respuesta.answer,
        fuentes: respuesta.sources,
        acciones: respuesta.actions,
        sugerencias: respuesta.suggestedQuestions,
        confianza: respuesta.confidence,
        escalar: respuesta.escalationSuggested,
      });
    }
    await registrarUso(supabase, {
      moduloActual,
      modelo: modeloUsado,
      tokensEntrada,
      tokensSalida,
      tokensCache,
      costoEstimado: costo,
      duracionMs: Date.now() - inicio,
      estado: 'ok',
    });

    return responderQovi(200, respuesta, { conversacionId: conversacionIdFinal, mensajeId });
  } catch (err) {
    console.error('[qovi/chat]', err);
    Sentry.captureException(err);
    const respuesta = respuestaError();
    if (conversacionIdFinal) {
      await guardarMensaje(supabase, { conversacionId: conversacionIdFinal, rol: 'user', contenido: mensaje });
      await guardarMensaje(supabase, { conversacionId: conversacionIdFinal, rol: 'assistant', contenido: respuesta.answer, confianza: 'baja' });
    }
    await registrarUso(supabase, {
      moduloActual,
      modelo: QOVI_MODEL,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimado: 0,
      duracionMs: Date.now() - inicio,
      estado: 'error',
    });
    return responderQovi(500, respuesta, { conversacionId: conversacionIdFinal });
  }
}
