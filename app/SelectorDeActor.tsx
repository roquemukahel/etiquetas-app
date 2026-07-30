'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { Actor, getActor, setActor as guardarActor } from './lib/actor';

const RUTAS_SIN_SELECTOR = [
  '/login',
  '/registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
];

type Persona = { id: string; nombre: string };

export default function SelectorDeActor() {
  const pathname = usePathname();
  const supabase = crearClienteNavegador();

  const [actor, setActorState] = useState<Actor | null | undefined>(undefined);
  const [cambiando, setCambiando] = useState(false);
  const [eligiendoTipo, setEligiendoTipo] = useState<'vendedor' | 'tecnico' | null>(null);
  const [vendedores, setVendedores] = useState<Persona[]>([]);
  const [tecnicos, setTecnicos] = useState<Persona[]>([]);
  const [cargado, setCargado] = useState(false);

  const esRutaExcluida = RUTAS_SIN_SELECTOR.some((r) => pathname?.startsWith(r));

  useEffect(() => {
    setActorState(getActor());
  }, []);

  useEffect(() => {
    if (esRutaExcluida || cargado) return;
    (async () => {
      const [{ data: vend }, { data: tec }] = await Promise.all([
        supabase.from('vendedores').select('id, nombre').order('nombre'),
        supabase.from('tecnicos').select('id, nombre').order('nombre'),
      ]);
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setCargado(true);
    })();
  }, [esRutaExcluida, cargado]);

  if (esRutaExcluida || actor === undefined) return null;

  const elegir = (tipo: 'vendedor' | 'tecnico', persona: Persona) => {
    const nuevo: Actor = { tipo, id: persona.id, nombre: persona.nombre };
    guardarActor(nuevo);
    setActorState(nuevo);
    setEligiendoTipo(null);
    setCambiando(false);
  };

  const sinPersonas = cargado && vendedores.length === 0 && tecnicos.length === 0;
  const mostrarOverlay = !actor || cambiando;

  return (
    <>
      {actor && (
        <div className="sticky top-0 z-40 w-full bg-ink text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-good shrink-0" />
            Trabajando como <strong>{actor.nombre}</strong>
          </span>
          <button onClick={() => setCambiando(true)} className="underline opacity-80 hover:opacity-100">
            Cambiar
          </button>
        </div>
      )}

      {mostrarOverlay && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-white dark:bg-dark-surface rounded-2xl shadow-elevated p-6 flex flex-col gap-4">
            {actor && !eligiendoTipo && (
              <button
                onClick={() => setCambiando(false)}
                className="self-start text-xs text-muted dark:text-dark-text-secondary underline"
              >
                Cancelar
              </button>
            )}

            {!eligiendoTipo ? (
              <>
                <div className="text-center">
                  <p className="text-lg font-display font-semibold">¡Bienvenido/a! 👋</p>
                  <p className="text-sm text-muted dark:text-dark-text-secondary mt-1">¿Con quién tengo el gusto?</p>
                </div>

                {sinPersonas ? (
                  <div className="flex flex-col gap-2 text-center">
                    <p className="text-sm text-muted dark:text-dark-text-secondary">
                      Todavía no cargaste vendedores ni técnicos.
                    </p>
                    <Link href="/configuracion/vendedores" className="text-sm text-accent dark:text-dark-accent underline">
                      Cargar vendedores
                    </Link>
                    <Link href="/configuracion/tecnicos" className="text-sm text-accent dark:text-dark-accent underline">
                      Cargar técnicos
                    </Link>
                    <button
                      onClick={() => setCambiando(false)}
                      className="text-xs text-muted dark:text-dark-text-secondary underline mt-2"
                    >
                      Continuar sin elegir por ahora
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEligiendoTipo('vendedor')}
                      disabled={vendedores.length === 0}
                      className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
                    >
                      Soy vendedor
                    </button>
                    <button
                      onClick={() => setEligiendoTipo('tecnico')}
                      disabled={tecnicos.length === 0}
                      className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
                    >
                      Soy técnico
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setEligiendoTipo(null)}
                  className="self-start text-xs text-accent dark:text-dark-accent underline"
                >
                  &larr; Volver
                </button>
                <p className="text-sm font-medium">Elegí tu nombre</p>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {(eligiendoTipo === 'vendedor' ? vendedores : tecnicos).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => elegir(eligiendoTipo, p)}
                      className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg"
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
