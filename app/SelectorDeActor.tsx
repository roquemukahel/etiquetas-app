'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { Actor, getActor, setActor as guardarActor, clearActor } from './lib/actor';
import Avatar from './Avatar';

const RUTAS_SIN_SELECTOR = [
  '/login',
  '/registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/boleta',
];

const KEY_POSTERGADO = 'qovento:actor-postergado';

type Persona = { id: string; nombre: string; foto_url: string | null; telefono: string | null; edad: number | null };

export default function SelectorDeActor() {
  const pathname = usePathname();
  const supabase = crearClienteNavegador();

  const [actor, setActorState] = useState<Actor | null | undefined>(undefined);
  const [postergado, setPostergado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [eligiendoTipo, setEligiendoTipo] = useState<'vendedor' | 'tecnico' | null>(null);
  const [vendedores, setVendedores] = useState<Persona[]>([]);
  const [tecnicos, setTecnicos] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(false);
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [telefonoPerfil, setTelefonoPerfil] = useState('');
  const [edadPerfil, setEdadPerfil] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  // La raíz ("/") muestra la landing pública a quien no tiene sesión, así
  // que ahí necesitamos saber si hay usuario logueado antes de decidir si
  // corresponde mostrar el cartel (no tiene sentido preguntarle "con quién
  // tengo el gusto" a un visitante anónimo de la landing).
  const [sesion, setSesion] = useState<'cargando' | 'si' | 'no'>('cargando');

  const esRaiz = pathname === '/';
  const esRutaExcluida = RUTAS_SIN_SELECTOR.some((r) => pathname?.startsWith(r)) || (esRaiz && sesion === 'no');
  const mostrarOverlay = (!actor && !postergado) || cambiando;

  useEffect(() => {
    setActorState(getActor());
    setPostergado(window.sessionStorage.getItem(KEY_POSTERGADO) === '1');
  }, []);

  // El actor queda guardado en este navegador, no en la cuenta — si en algún
  // momento se entró con otra cuenta sin que se haya limpiado bien (ej. un
  // logout viejo, antes de que esto se corrigiera), puede quedar apuntando a
  // un vendedor/técnico que no es de este negocio. Lo validamos apenas hay
  // sesión y, si no existe acá, lo borramos solo (no toca ningún dato, solo
  // esta preferencia local).
  useEffect(() => {
    if (!actor) return;
    (async () => {
      const tabla = actor.tipo === 'vendedor' ? 'vendedores' : 'tecnicos';
      const { data, error } = await supabase.from(tabla).select('id').eq('id', actor.id).maybeSingle();
      if (!error && !data) {
        clearActor();
        setActorState(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor?.id]);

  useEffect(() => {
    if (!esRaiz) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSesion(user ? 'si' : 'no');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRaiz]);

  // Recargamos las listas cada vez que el cartel se abre (no solo la primera
  // vez), para que si acabás de cargar un vendedor/técnico en Configuración,
  // ya aparezca acá sin tener que recargar la página entera.
  useEffect(() => {
    if (esRutaExcluida || !mostrarOverlay || cargando) return;
    setCargando(true);
    (async () => {
      const [{ data: vend }, { data: tec }] = await Promise.all([
        supabase.from('vendedores').select('id, nombre, foto_url, telefono, edad').order('nombre'),
        supabase.from('tecnicos').select('id, nombre, foto_url, telefono, edad').order('nombre'),
      ]);
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRutaExcluida, mostrarOverlay]);

  if (esRutaExcluida || actor === undefined || (esRaiz && sesion === 'cargando')) return null;

  const elegir = (tipo: 'vendedor' | 'tecnico', persona: Persona) => {
    const nuevo: Actor = { tipo, id: persona.id, nombre: persona.nombre, fotoUrl: persona.foto_url };
    guardarActor(nuevo);
    setActorState(nuevo);
    setEligiendoTipo(null);
    setCambiando(false);
  };

  const abrirMiPerfil = async () => {
    if (!actor) return;
    const tabla = actor.tipo === 'vendedor' ? 'vendedores' : 'tecnicos';
    const { data: persona } = await supabase.from(tabla).select('telefono, edad').eq('id', actor.id).single();
    setTelefonoPerfil(persona?.telefono ?? '');
    setEdadPerfil(persona?.edad != null ? String(persona.edad) : '');
    setEditandoPerfil(true);
  };

  const cambiarFotoPerfil = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !actor) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const tabla = actor.tipo === 'vendedor' ? 'vendedores' : 'tecnicos';
      await supabase.from(tabla).update({ foto_url: dataUrl }).eq('id', actor.id);
      const actualizado = { ...actor, fotoUrl: dataUrl };
      guardarActor(actualizado);
      setActorState(actualizado);
    };
    reader.readAsDataURL(file);
  };

  const guardarMiPerfil = async () => {
    if (!actor) return;
    setGuardandoPerfil(true);
    const tabla = actor.tipo === 'vendedor' ? 'vendedores' : 'tecnicos';
    await supabase
      .from(tabla)
      .update({ telefono: telefonoPerfil.trim() || null, edad: edadPerfil ? Number(edadPerfil) : null })
      .eq('id', actor.id);
    setGuardandoPerfil(false);
    setEditandoPerfil(false);
  };

  const posponer = () => {
    window.sessionStorage.setItem(KEY_POSTERGADO, '1');
    setPostergado(true);
  };

  const retomarEleccion = () => {
    window.sessionStorage.removeItem(KEY_POSTERGADO);
    setPostergado(false);
  };

  const sinPersonas = !cargando && vendedores.length === 0 && tecnicos.length === 0;

  return (
    <>
      {actor && (
        <div className="no-print sticky top-0 z-40 w-full bg-ink text-white text-xs px-4 py-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full bg-good shrink-0" />
            <Avatar src={actor.fotoUrl} nombre={actor.nombre} size={34} />
            <span className="truncate">
              Trabajando como <strong>{actor.nombre}</strong>
            </span>
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <button onClick={abrirMiPerfil} className="underline opacity-80 hover:opacity-100">
              Mi perfil
            </button>
            <button onClick={() => setCambiando(true)} className="underline opacity-80 hover:opacity-100">
              Cambiar
            </button>
          </span>
        </div>
      )}

      {editandoPerfil && actor && (
        <div className="no-print fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-white dark:bg-dark-surface rounded-2xl shadow-elevated p-6 flex flex-col gap-4">
            <button
              onClick={() => setEditandoPerfil(false)}
              className="self-start text-xs text-muted dark:text-dark-text-secondary underline"
            >
              Cerrar
            </button>

            <div className="flex items-center gap-3">
              <label className="shrink-0 cursor-pointer">
                <Avatar src={actor.fotoUrl} nombre={actor.nombre} size={72} />
                <input type="file" accept="image/*" className="hidden" onChange={cambiarFotoPerfil} />
              </label>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{actor.nombre}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary">Tocá la foto para cambiarla</p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={telefonoPerfil}
                onChange={(e) => setTelefonoPerfil(e.target.value)}
                placeholder="Teléfono"
                className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={edadPerfil}
                onChange={(e) => setEdadPerfil(e.target.value)}
                placeholder="Edad"
                inputMode="numeric"
                className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <button
              disabled={guardandoPerfil}
              onClick={guardarMiPerfil}
              className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {!actor && postergado && !cambiando && (
        <div className="no-print sticky top-0 z-40 w-full bg-ink text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span>Sin elegir quién trabaja</span>
          <button onClick={retomarEleccion} className="underline opacity-80 hover:opacity-100">
            Elegir
          </button>
        </div>
      )}

      {mostrarOverlay && (
        <div className="no-print fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-6">
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

                {cargando ? (
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center">Cargando...</p>
                ) : sinPersonas ? (
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
                      onClick={posponer}
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
                      className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg flex items-center gap-2.5"
                    >
                      <Avatar src={p.foto_url} nombre={p.nombre} size={56} />
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
