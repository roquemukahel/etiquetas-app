'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useActor } from './lib/actor';
import { useT } from './lib/idioma';
import { crearClienteNavegador } from './lib/supabase/client';
import { soportaMigracion } from './lib/migraciones';
import { registrarFallo } from './lib/escritura';
import { moduloDeRuta, mensajeInicial, PREGUNTAS_SUGERIDAS_POR_MODULO, ETIQUETA_MODULO } from './lib/qovi/modulos';
import { rolDeActor } from './lib/qovi/rol';
import { preguntarQovi } from './lib/qovi/cliente';
import type { AccionQovi, FuenteQovi } from './lib/qovi/respuesta';
import { BotonLink } from './Boton';

type MensajeChat = {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
  fuentes?: FuenteQovi[];
  acciones?: AccionQovi[];
  sugerencias?: string[];
  escalar?: boolean;
  mensajeIdDb?: string | null;
  valoracion?: 'util' | 'no_util' | null;
  esError?: boolean;
};

const CLAVE_SESION = 'qovento:qovi-conversacion';

function idTemporal() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Separa la respuesta en párrafos/pasos para que un "1. ... 2. ..." se vea
// como lista, no como un bloque de texto corrido.
function Respuesta({ texto }: { texto: string }) {
  const lineas = texto.split(/\n+/).filter(Boolean);
  const pareceLista = lineas.length > 1 && lineas.some((l) => /^\d+[.)]\s/.test(l.trim()));
  if (!pareceLista) return <p className="text-sm whitespace-pre-wrap">{texto}</p>;
  return (
    <ol className="text-sm list-decimal pl-4 flex flex-col gap-1">
      {lineas.map((l, i) => (
        <li key={i}>{l.replace(/^\d+[.)]\s*/, '')}</li>
      ))}
    </ol>
  );
}

export default function QoviWidget() {
  const t = useT();
  const pathname = usePathname();
  const actor = useActor();
  const supabase = crearClienteNavegador();

  const moduloActual = useMemo(() => moduloDeRuta(pathname), [pathname]);
  const rolActual = useMemo(() => rolDeActor(actor), [actor]);

  const [abierto, setAbierto] = useState(false);
  const [entrada, setEntrada] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  // null = todavía no se sabe (no se muestra nada hasta confirmar, para no parpadear);
  // false = el negocio no corrió qovi_supabase.sql todavía.
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    soportaMigracion(supabase, 'qovi').then(setDisponible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animación de entrada una sola vez al montar — respeta prefers-reduced-motion (sin la clase, no hay transform que animar).
  useEffect(() => {
    const t = setTimeout(() => setEntrada(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Conserva la conversación mientras dure la pestaña (sessionStorage, no para siempre).
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_SESION);
      if (guardado) {
        const datos = JSON.parse(guardado);
        if (Array.isArray(datos.mensajes)) setMensajes(datos.mensajes);
        if (typeof datos.conversacionId === 'string') setConversacionId(datos.conversacionId);
      }
    } catch {
      // sessionStorage puede fallar (ventana privada) — Qovi igual funciona, solo no recuerda al recargar.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ mensajes, conversacionId }));
    } catch {
      // Igual que la lectura de arriba: sessionStorage puede no estar disponible (ventana privada, cupo lleno) y no es crítico.
    }
  }, [mensajes, conversacionId]);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, abierto, cargando]);

  const nuevaConversacion = () => {
    setMensajes([]);
    setConversacionId(null);
    setLimiteAlcanzado(false);
    try {
      sessionStorage.removeItem(CLAVE_SESION);
    } catch {
      // No crítico: si falla, la conversación vieja igual se reemplaza en memoria (arriba).
    }
  };

  const enviar = async (textoForzado?: string) => {
    const mensaje = (textoForzado ?? texto).trim();
    if (!mensaje || cargando) return;
    setTexto('');
    setMensajes((prev) => [...prev, { id: idTemporal(), rol: 'user', texto: mensaje }]);
    setCargando(true);

    const resultado = await preguntarQovi({
      mensaje,
      moduloActual,
      rolActual,
      conversacionId,
      actorNombre: actor?.nombre ?? null,
      actorTipo: actor?.tipo ?? null,
    });

    setCargando(false);

    if (!resultado.ok) {
      setMensajes((prev) => [...prev, { id: idTemporal(), rol: 'assistant', texto: resultado.mensaje, esError: true }]);
      return;
    }
    if (resultado.conversacionId) setConversacionId(resultado.conversacionId);
    if (resultado.limiteAlcanzado) setLimiteAlcanzado(true);
    const r = resultado.respuesta;
    setMensajes((prev) => [
      ...prev,
      {
        id: idTemporal(),
        rol: 'assistant',
        texto: r.answer,
        fuentes: r.sources,
        acciones: r.actions,
        sugerencias: r.suggestedQuestions,
        escalar: r.escalationSuggested,
        mensajeIdDb: resultado.mensajeId,
        valoracion: null,
      },
    ]);
  };

  const valorar = async (m: MensajeChat, valoracion: 'util' | 'no_util') => {
    if (!m.mensajeIdDb) return;
    setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, valoracion } : x)));
    const { error } = await supabase.from('qovi_mensajes').update({ valoracion }).eq('id', m.mensajeIdDb);
    if (error) registrarFallo(error, 'guardar valoración de un mensaje de Qovi');
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso del navegador o sin HTTPS: no es crítico, el usuario puede seleccionar el texto a mano.
    }
  };

  const sugerencias = mensajes.length === 0 ? PREGUNTAS_SUGERIDAS_POR_MODULO[moduloActual] : [];

  if (!disponible) return null;

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? t('Cerrar Qovi') : t('Abrir Qovi, el asistente de Qovento')}
        aria-expanded={abierto}
        className={`no-print fixed bottom-5 left-5 z-40 h-14 w-14 rounded-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated flex items-center justify-center transition-transform duration-500 motion-reduce:transition-none hover:scale-105 ${
          entrada ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qovi-saludo.webp" alt="" aria-hidden="true" className="w-11 h-11 object-contain" />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Qovi, asistente inteligente de Qovento')}
          className="no-print fixed inset-0 sm:inset-auto sm:bottom-5 sm:left-5 z-50 flex flex-col w-full sm:w-[420px] sm:max-w-[calc(100vw-2.5rem)] h-full sm:h-[min(640px,calc(100vh-2.5rem))] sm:rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated overflow-hidden"
        >
          <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border dark:border-dark-border shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovi-saludo.webp" alt="" aria-hidden="true" className="w-9 h-9 object-contain shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Qovi</p>
              <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-good inline-block" aria-hidden="true" />
                {t('Asistente inteligente de Qovento')}
              </p>
            </div>
            <button
              onClick={nuevaConversacion}
              aria-label={t('Iniciar una conversación nueva')}
              title={t('Nueva conversación')}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg"
            >
              ＋
            </button>
            <button
              onClick={() => setAbierto(false)}
              aria-label={t('Cerrar')}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg text-lg"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {mensajes.length === 0 && (
              <div className="rounded-2xl rounded-tl-md bg-canvas dark:bg-dark-bg px-3.5 py-2.5 self-start max-w-[90%]">
                <p className="text-sm">{mensajeInicial(moduloActual)}</p>
              </div>
            )}

            {mensajes.map((m) => (
              <div key={m.id} className={`flex flex-col gap-1.5 max-w-[90%] ${m.rol === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 ${
                    m.rol === 'user'
                      ? 'bg-accent dark:bg-dark-accent text-white rounded-tr-md'
                      : `bg-canvas dark:bg-dark-bg rounded-tl-md ${m.esError ? 'text-bad' : ''}`
                  }`}
                >
                  <Respuesta texto={m.texto} />
                </div>

                {m.rol === 'assistant' && !m.esError && (
                  <div className="flex items-center gap-2 px-1">
                    <button onClick={() => copiar(m.texto)} className="text-[11px] text-muted dark:text-dark-text-secondary hover:underline">
                      {t('Copiar')}
                    </button>
                    {m.mensajeIdDb && (
                      <>
                        <button
                          onClick={() => valorar(m, 'util')}
                          aria-label={t('Me sirvió')}
                          className={`text-[13px] ${m.valoracion === 'util' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                        >
                          👍
                        </button>
                        <button
                          onClick={() => valorar(m, 'no_util')}
                          aria-label={t('No me sirvió')}
                          className={`text-[13px] ${m.valoracion === 'no_util' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                        >
                          👎
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!!m.fuentes?.length && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {m.fuentes.map((f) => (
                      <span key={f.slug} className="text-[10px] rounded-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-2 py-0.5 text-muted dark:text-dark-text-secondary">
                        {f.titulo}
                      </span>
                    ))}
                  </div>
                )}

                {!!m.acciones?.length && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {m.acciones.map((a) => (
                      <BotonLink key={a.clave} href={a.href} variante="secundario" tamano="sm">
                        {t(a.etiqueta)}
                      </BotonLink>
                    ))}
                  </div>
                )}

                {m.escalar && (
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary px-1">
                    {t('¿Seguís con dudas? Escribinos a soporte desde Configuración.')}
                  </p>
                )}

                {!!m.sugerencias?.length && (
                  <div className="flex flex-col gap-1 px-1 pt-1">
                    {m.sugerencias.map((s) => (
                      <button key={s} onClick={() => enviar(s)} className="text-left text-xs text-accent dark:text-dark-accent underline underline-offset-2">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sugerencias.length > 0 && (
              <div className="flex flex-col gap-1.5 self-start max-w-[95%]">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-left text-xs rounded-xl border border-border dark:border-dark-border px-3 py-2 hover:bg-canvas dark:hover:bg-dark-bg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {cargando && (
              <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-tl-md bg-canvas dark:bg-dark-bg px-3.5 py-2.5" aria-live="polite">
                <span className="sr-only">{t('Qovi está escribiendo...')}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted dark:bg-dark-text-secondary animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted dark:bg-dark-text-secondary animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted dark:bg-dark-text-secondary animate-bounce" />
              </div>
            )}
            <div ref={finRef} />
          </div>

          <div className="border-t border-border dark:border-dark-border px-3 py-2.5 shrink-0 flex flex-col gap-1.5">
            <p className="text-[10px] text-muted dark:text-dark-text-secondary px-1">
              {t('Qovi puede cometer errores. No compartas contraseñas ni información sensible.')}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
              className="flex items-center gap-2"
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={limiteAlcanzado ? t('Límite de consultas alcanzado por hoy') : t('Escribí tu pregunta...')}
                disabled={limiteAlcanzado}
                maxLength={1000}
                aria-label={t('Escribí tu pregunta para Qovi')}
                className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-xl px-3 py-2 text-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!texto.trim() || cargando || limiteAlcanzado}
                aria-label={t('Enviar')}
                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-accent dark:bg-dark-accent text-white disabled:opacity-40"
              >
                ↑
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
