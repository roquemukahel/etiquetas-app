'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { Actor, getActor, setActor as guardarActor, clearActor } from './lib/actor';
import { useIdioma, setIdioma, useT, IDIOMAS_DISPONIBLES, siguienteIdioma } from './lib/idioma';
import { sincronizarCookieSucursal, getSucursalManual } from './lib/sucursal';
import Avatar from './Avatar';

const RUTAS_SIN_SELECTOR = [
  '/login',
  '/registro',
  '/cuenta-desactivada',
  '/suscripcion-vencida',
  '/terminos',
  '/privacidad',
  '/seguimiento',
  '/cuenta/',
  '/boleta',
];

const KEY_POSTERGADO = 'qovento:actor-postergado';

type Persona = {
  id: string;
  nombre: string;
  foto_url: string | null;
  telefono: string | null;
  edad: number | null;
  tienePin: boolean;
  // Mismas columnas de permisos en vendedores y técnicos (ver
  // app/lib/actor.ts). Vienen de una consulta APARTE (ver más abajo) que
  // se pide por separado a propósito: si algún permiso nuevo todavía no
  // existe en la base (el SQL no se corrió), esa consulta puede fallar
  // sola sin romper la consulta principal (nombre/foto/PIN) — así el
  // selector y el candadito siguen funcionando aunque los permisos
  // todavía no estén disponibles.
  es_administrador?: boolean;
  acceso_completo?: boolean;
  puede_vender?: boolean;
  puede_eliminar?: boolean;
  puede_agregar_stock?: boolean;
  puede_ver_estadisticas?: boolean;
  puede_recibir_servicio_tecnico?: boolean;
  puede_gestionar_servicio_tecnico?: boolean;
  puede_gestionar_financiacion?: boolean;
  // Sucursal asignada (Configuración > Vendedores/Técnicos) — misma
  // consulta aparte que los permisos de arriba, por el mismo motivo: si
  // sucursales_supabase.sql todavía no se corrió, esta columna no existe
  // y esa consulta puede fallar sola sin romper nombre/foto/PIN.
  sucursal_id?: string | null;
};

const COLUMNAS_PERMISOS =
  'id, es_administrador, acceso_completo, puede_vender, puede_eliminar, puede_agregar_stock, puede_ver_estadisticas, puede_recibir_servicio_tecnico, puede_gestionar_servicio_tecnico, puede_gestionar_financiacion';

export default function SelectorDeActor() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const idioma = useIdioma();
  const t = useT();

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
  // Si la persona elegida tiene PIN cargado (ver Configuración >
  // Vendedores/Técnicos), hay que confirmarlo antes de atribuirle la
  // acción — evita que cualquiera se elija a sí mismo como otra persona.
  const [personaPin, setPersonaPin] = useState<{ tipo: 'vendedor' | 'tecnico'; persona: Persona } | null>(null);
  const [pinIngresado, setPinIngresado] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [verificandoPin, setVerificandoPin] = useState(false);
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
      const [{ data: vend }, { data: tec }, { data: idsVend }, { data: idsTec }, permVendRes, permTecRes, sucVendRes, sucTecRes] = await Promise.all([
        supabase.from('vendedores').select('id, nombre, foto_url, telefono, edad').order('nombre'),
        supabase.from('tecnicos').select('id, nombre, foto_url, telefono, edad').order('nombre'),
        supabase.rpc('ids_vendedores_con_pin'),
        supabase.rpc('ids_tecnicos_con_pin'),
        supabase.from('vendedores').select(COLUMNAS_PERMISOS),
        supabase.from('tecnicos').select(COLUMNAS_PERMISOS),
        // sucursal_id en su PROPIA consulta (no en COLUMNAS_PERMISOS): si
        // sucursales_supabase.sql todavía no se corrió para este negocio, la
        // columna no existe y esta consulta puntual falla sola — sin eso,
        // un error acá tumbaría también la consulta de permisos de arriba,
        // que sí existe siempre.
        supabase.from('vendedores').select('id, sucursal_id'),
        supabase.from('tecnicos').select('id, sucursal_id'),
      ]);
      const conPinVend = new Set(((idsVend as { id: string }[]) ?? []).map((r) => r.id));
      const conPinTec = new Set(((idsTec as { id: string }[]) ?? []).map((r) => r.id));
      // permVendRes/permTecRes pueden venir con error (columnas todavía no
      // creadas) sin que eso afecte nombre/foto/PIN de arriba — en ese
      // caso el mapa queda vacío y cada persona simplemente no trae datos
      // de permisos (los defaults "?? true" de más abajo se hacen cargo).
      const permisosVend = new Map(((permVendRes.data as any[]) ?? []).map((p) => [p.id, p]));
      const permisosTec = new Map(((permTecRes.data as any[]) ?? []).map((p) => [p.id, p]));
      const sucursalVend = new Map(((sucVendRes.data as { id: string; sucursal_id: string | null }[]) ?? []).map((p) => [p.id, p.sucursal_id]));
      const sucursalTec = new Map(((sucTecRes.data as { id: string; sucursal_id: string | null }[]) ?? []).map((p) => [p.id, p.sucursal_id]));
      setVendedores((vend ?? []).map((v) => ({ ...v, tienePin: conPinVend.has(v.id), ...permisosVend.get(v.id), sucursal_id: sucursalVend.get(v.id) ?? null })));
      setTecnicos((tec ?? []).map((tc) => ({ ...tc, tienePin: conPinTec.has(tc.id), ...permisosTec.get(tc.id), sucursal_id: sucursalTec.get(tc.id) ?? null })));
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRutaExcluida, mostrarOverlay]);

  if (esRutaExcluida || actor === undefined || (esRaiz && sesion === 'cargando')) return null;

  const elegir = (tipo: 'vendedor' | 'tecnico', persona: Persona) => {
    const nuevo: Actor = {
      tipo,
      id: persona.id,
      nombre: persona.nombre,
      fotoUrl: persona.foto_url,
      permisos: {
        esAdministrador: persona.es_administrador ?? true,
        accesoCompleto: persona.acceso_completo ?? true,
        puedeVender: persona.puede_vender ?? true,
        puedeEliminar: persona.puede_eliminar ?? true,
        puedeAgregarStock: persona.puede_agregar_stock ?? true,
        puedeVerEstadisticas: persona.puede_ver_estadisticas ?? true,
        puedeRecibirServicioTecnico: persona.puede_recibir_servicio_tecnico ?? true,
        puedeGestionarServicioTecnico: persona.puede_gestionar_servicio_tecnico ?? true,
        puedeGestionarFinanciacion: persona.puede_gestionar_financiacion ?? true,
      },
      sucursalId: persona.sucursal_id ?? null,
    };
    guardarActor(nuevo);
    setActorState(nuevo);
    setEligiendoTipo(null);
    setCambiando(false);
    setPersonaPin(null);
    // Si esta persona tiene sucursal fija, Inicio (Server Component) tiene
    // que enterarse YA — si no, hasta que no haya otra navegación completa
    // sigue mostrando datos de la sucursal anterior (o sin filtrar). Si NO
    // tiene fija, se respeta la manual que ya hubiera elegida en este
    // navegador (mismo criterio de useSucursalActual): no pisarla con null.
    sincronizarCookieSucursal(nuevo.sucursalId ?? getSucursalManual());
    router.refresh();
  };

  const tocarPersona = (tipo: 'vendedor' | 'tecnico', persona: Persona) => {
    if (persona.tienePin) {
      setPersonaPin({ tipo, persona });
      setPinIngresado('');
      setErrorPin(null);
    } else {
      elegir(tipo, persona);
    }
  };

  const confirmarPin = async () => {
    if (!personaPin) return;
    setVerificandoPin(true);
    const rpc = personaPin.tipo === 'vendedor' ? 'verificar_pin_vendedor' : 'verificar_pin_tecnico';
    const idParam = personaPin.tipo === 'vendedor' ? 'vendedor_id' : 'tecnico_id';
    const { data: correcto } = await supabase.rpc(rpc, { [idParam]: personaPin.persona.id, pin_ingresado: pinIngresado });
    setVerificandoPin(false);
    if (!correcto) {
      setErrorPin('PIN incorrecto');
      return;
    }
    elegir(personaPin.tipo, personaPin.persona);
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
            <Avatar src={actor.fotoUrl} nombre={actor.nombre} size={40} />
            <span className="truncate">
              {t('Trabajando como')} <strong>{actor.nombre}</strong>
            </span>
          </span>
          <span className="flex items-center gap-3 shrink-0">
            {/* Selector de idioma — un botón que rota español/portugués/
               inglés (ver app/lib/idioma.ts). Visible en todas las
               pantallas porque esta barra es la única franja que aparece
               siempre, en celular y en escritorio. */}
            <button
              onClick={() => {
                setIdioma(siguienteIdioma(idioma));
                // Inicio (app/page.tsx) es un Server Component: sin este
                // refresh, la cookie nueva no se nota hasta la próxima
                // navegación entera.
                router.refresh();
              }}
              title={t('Cambiar idioma')}
              className="rounded-full border border-white/30 px-2 py-0.5 font-medium opacity-80 hover:opacity-100"
            >
              {IDIOMAS_DISPONIBLES.find((i) => i.valor === idioma)?.etiqueta ?? idioma}
            </button>
            <button onClick={abrirMiPerfil} className="underline opacity-80 hover:opacity-100">
              {t('Mi perfil')}
            </button>
            <button onClick={() => setCambiando(true)} className="underline opacity-80 hover:opacity-100">
              {t('Cambiar')}
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
              {t('Cerrar')}
            </button>

            <div className="flex items-center gap-3">
              <label className="shrink-0 cursor-pointer">
                <Avatar src={actor.fotoUrl} nombre={actor.nombre} size={84} />
                <input type="file" accept="image/*" className="hidden" onChange={cambiarFotoPerfil} />
              </label>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{actor.nombre}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Tocá la foto para cambiarla')}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={telefonoPerfil}
                onChange={(e) => setTelefonoPerfil(e.target.value)}
                placeholder={t('Teléfono')}
                className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={edadPerfil}
                onChange={(e) => setEdadPerfil(e.target.value)}
                placeholder={t('Edad')}
                inputMode="numeric"
                className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <button
              disabled={guardandoPerfil}
              onClick={guardarMiPerfil}
              className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              {t('Guardar')}
            </button>
          </div>
        </div>
      )}

      {!actor && postergado && !cambiando && (
        <div className="no-print sticky top-0 z-40 w-full bg-ink text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span>{t('Sin elegir quién trabaja')}</span>
          <button onClick={retomarEleccion} className="underline opacity-80 hover:opacity-100">
            {t('Elegir')}
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
                {t('Cancelar')}
              </button>
            )}

            {!eligiendoTipo ? (
              <>
                <div className="text-center">
                  <p className="text-lg font-display font-semibold">{t('¡Bienvenido/a! 👋')}</p>
                  <p className="text-sm text-muted dark:text-dark-text-secondary mt-1">{t('¿Con quién tengo el gusto?')}</p>
                </div>

                {cargando ? (
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center">{t('Cargando...')}</p>
                ) : sinPersonas ? (
                  <div className="flex flex-col gap-2 text-center">
                    <p className="text-sm text-muted dark:text-dark-text-secondary">
                      {t('Todavía no cargaste vendedores ni técnicos.')}
                    </p>
                    <Link href="/configuracion/vendedores" className="text-sm text-accent dark:text-dark-accent underline">
                      {t('Cargar vendedores')}
                    </Link>
                    <Link href="/configuracion/tecnicos" className="text-sm text-accent dark:text-dark-accent underline">
                      {t('Cargar técnicos')}
                    </Link>
                    <button
                      onClick={posponer}
                      className="text-xs text-muted dark:text-dark-text-secondary underline mt-2"
                    >
                      {t('Continuar sin elegir por ahora')}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEligiendoTipo('vendedor')}
                      disabled={vendedores.length === 0}
                      className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
                    >
                      {t('Soy vendedor')}
                    </button>
                    <button
                      onClick={() => setEligiendoTipo('tecnico')}
                      disabled={tecnicos.length === 0}
                      className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
                    >
                      {t('Soy técnico')}
                    </button>
                  </div>
                )}
              </>
            ) : personaPin ? (
              <>
                <button
                  onClick={() => setPersonaPin(null)}
                  className="self-start text-xs text-accent dark:text-dark-accent underline"
                >
                  &larr; {t('Volver')}
                </button>
                <div className="flex items-center gap-2.5">
                  <Avatar src={personaPin.persona.foto_url} nombre={personaPin.persona.nombre} size={48} />
                  <p className="text-sm font-medium">
                    {t('Ingresá el PIN de')} {personaPin.persona.nombre}
                  </p>
                </div>
                {errorPin && <p className="text-xs text-bad">{t(errorPin)}</p>}
                <input
                  value={pinIngresado}
                  onChange={(e) => {
                    setPinIngresado(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setErrorPin(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && confirmarPin()}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="····"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-3 text-center text-lg tracking-[0.5em]"
                />
                <button
                  onClick={confirmarPin}
                  disabled={pinIngresado.length < 4 || verificandoPin}
                  className="rounded-xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
                >
                  {verificandoPin ? t('Verificando...') : t('Confirmar')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEligiendoTipo(null)}
                  className="self-start text-xs text-accent dark:text-dark-accent underline"
                >
                  &larr; {t('Volver')}
                </button>
                <p className="text-sm font-medium">{t('Elegí tu nombre')}</p>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {(eligiendoTipo === 'vendedor' ? vendedores : tecnicos).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => tocarPersona(eligiendoTipo, p)}
                      className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg flex items-center gap-2.5"
                    >
                      <Avatar src={p.foto_url} nombre={p.nombre} size={64} />
                      {p.nombre}
                      {p.tienePin && <span className="ml-auto text-muted dark:text-dark-text-secondary">🔒</span>}
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
