'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { soportaMigracion } from '../lib/migraciones';
import { obtenerTodasLasFilas } from '../lib/db';
import { simboloMoneda } from '../lib/monedas';
import { contarFotosDe, obtenerFotos } from '../lib/fotosDispositivo';
import { obtenerDispositivosSenados } from '../lib/planAhorro';
import { registrarAuditoria } from '../lib/auditoria';
import { imagenColorDeModelo } from '../lib/coloresModelo';
import { imagenPorNombreExacto, obtenerImagenesDeCarpetas } from '../lib/carpetas';
import {
  COLUMNAS_STANDBY,
  ETIQUETA_ORIGEN_STANDBY,
  buscarEnIndice,
  contarPorOrigen,
  indexarStandby,
  derivarStandbyAServicio,
  esAntiguoEnStandby,
  ordenarStandbyPor,
  volverAlStock,
  DIAS_ANTIGUO_EN_STANDBY,
  ERR_YA_NO_ESTA_EN_STANDBY,
  type CriterioOrdenStandby,
  type EquipoStandby,
  type OrigenStandby,
} from '../lib/standby';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { Boton } from '../Boton';
import { useT } from '../lib/idioma';
import { FilaStandby } from './FilaStandby';
import DetalleStandby, { type FotosDeEquipo } from './DetalleStandby';
import { ModalMotivo, ModalNuevoEquipo } from './ModalesStandby';

// Cuántos equipos se dibujan por vez: con cientos o miles en Standby la pantalla abre igual de rápido y se pide "Mostrar más".
const POR_PAGINA = 40;

type FiltroOrigen = OrigenStandby | 'sin_origen' | null;
const ORIGENES: (OrigenStandby | 'sin_origen')[] = ['stock', 'canje', 'servicio_tecnico', 'manual', 'sin_origen'];

const chip = (activo: boolean) =>
  `inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent ${
    activo
      ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent'
      : 'border-border dark:border-dark-border text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text'
  }`;

const controlChico =
  'h-8 rounded-md border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2 text-xs text-ink dark:text-dark-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent';

export default function Standby() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  const puedeVender = tienePermiso(actor, 'vender');
  const puedeServicio = tienePermiso(actor, 'recibir_servicio_tecnico');
  const puedeVerCostos = tienePermiso(actor, 'ver_costos');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [activo, setActivo] = useState<boolean | null>(null);
  const [equipos, setEquipos] = useState<EquipoStandby[]>([]);
  const [fotos, setFotos] = useState<Map<string, number>>(new Map());
  // Ids de los que ya se pidió el conteo de fotos (así no se repite el pedido mientras llega la respuesta).
  const fotosPedidas = useRef(new Set<string>());
  // Equipos señados (Plan de ahorro) que esperan acá hasta entregarse.
  const [senados, setSenados] = useState<Set<string>>(new Set());
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
  const [moneda, setMoneda] = useState('ARS');
  const [busqueda, setBusqueda] = useState('');
  // Mientras se escribe, la lista se actualiza con un pequeño retraso para que el teclado no se trabe.
  const busquedaDiferida = useDeferredValue(busqueda);
  const [orden, setOrden] = useState<CriterioOrdenStandby>('antiguos');
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>(null);
  const [soloAntiguos, setSoloAntiguos] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editandoMotivo, setEditandoMotivo] = useState<EquipoStandby | null>(null);
  // Equipo elegido en la lista y, en pantallas chicas (donde lista y ficha no entran juntas), si se está viendo la ficha.
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  // Miniaturas por carpeta de modelo (solo de los modelos que se están viendo) y fotos reales del equipo elegido.
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const carpetasPedidas = useRef(new Set<string>());
  const [fotosDeEquipo, setFotosDeEquipo] = useState<Map<string, FotosDeEquipo>>(new Map());

  const cargar = async () => {
    setError(null);
    try {
      setEquipos(
        await obtenerTodasLasFilas<EquipoStandby>(supabase, 'dispositivos', COLUMNAS_STANDBY, [{ columna: 'created_at', ascending: false }], (q) =>
          q.eq('en_espera', true)
        )
      );
      obtenerDispositivosSenados(supabase).then(setSenados).catch(() => {});
    } catch (e) {
      setError(t('No pudimos cargar los equipos en Standby:') + ' ' + (e instanceof Error ? e.message : t('error desconocido')));
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const ok = await soportaMigracion(supabase, 'standby');
      setActivo(ok);
      if (!ok) {
        setLoading(false);
        return;
      }
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Todavía no existe la tabla de sucursales en este negocio: se muestra todo junto.
      }
      await cargar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moneda del negocio para mostrar precio y costo con su símbolo (antes salía siempre "$" aunque el negocio use dólares).
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: errorPerfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      if (errorPerfil) return;
      const codigo = (data as { negocios?: { moneda?: string | null } | null } | null)?.negocios?.moneda;
      if (codigo) setMoneda(codigo);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El texto de búsqueda de cada equipo se arma una sola vez (al cargar), no en cada tecla.
  const indice = useMemo(() => indexarStandby(equipos), [equipos]);
  const enSucursal = useMemo(
    () => (filtroSucursal ? indice.filter((i) => i.equipo.sucursal_id === filtroSucursal) : indice),
    [indice, filtroSucursal]
  );
  // Los números de los filtros salen de lo que ya se buscó (sucursal + texto), para que cada botón diga cuántos hay de verdad.
  const buscados = useMemo(() => buscarEnIndice(enSucursal, busquedaDiferida), [enSucursal, busquedaDiferida]);
  const conteoOrigen = useMemo(() => contarPorOrigen(buscados), [buscados]);
  const cantidadAntiguos = useMemo(() => buscados.filter((e) => esAntiguoEnStandby(e)).length, [buscados]);
  const visibles = useMemo(() => {
    const filtrados = buscados.filter(
      (e) => (filtroOrigen === null || (e.espera_origen ?? 'sin_origen') === filtroOrigen) && (!soloAntiguos || esAntiguoEnStandby(e))
    );
    return ordenarStandbyPor(filtrados, orden);
  }, [buscados, filtroOrigen, soloAntiguos, orden]);
  const hayFiltros = busqueda.trim() !== '' || filtroOrigen !== null || soloAntiguos;
  // Al cambiar la búsqueda, los filtros o la sucursal se vuelve a la primera página.
  useEffect(() => {
    setLimite(POR_PAGINA);
  }, [busquedaDiferida, filtroSucursal, filtroOrigen, soloAntiguos, orden]);
  const paginaActual = useMemo(() => visibles.slice(0, limite), [visibles, limite]);

  // La selección siempre es un equipo que se ve. Si desaparece (se movió, se filtró) pasa al que quedó en su lugar.
  const ultimoIndice = useRef(0);
  useEffect(() => {
    if (visibles.length === 0) {
      setSeleccionId(null);
      return;
    }
    const idx = seleccionId ? visibles.findIndex((e) => e.id === seleccionId) : -1;
    if (idx >= 0) {
      ultimoIndice.current = idx;
      return;
    }
    setSeleccionId(visibles[Math.min(ultimoIndice.current, visibles.length - 1)].id);
  }, [visibles, seleccionId]);
  const seleccionado = useMemo(() => visibles.find((e) => e.id === seleccionId) ?? null, [visibles, seleccionId]);

  // Fotos reales: solo se cuentan las de los equipos que se están viendo (no las de todo el negocio).
  useEffect(() => {
    const faltan = paginaActual.map((e) => e.id).filter((id) => !fotosPedidas.current.has(id));
    if (faltan.length === 0) return;
    for (const id of faltan) fotosPedidas.current.add(id);
    contarFotosDe(supabase, faltan)
      .then((m) => {
        // Los que no tienen fotos también quedan anotados (con 0) para no volver a preguntar por ellos.
        setFotos((prev) => {
          const nuevo = new Map(prev);
          for (const id of faltan) nuevo.set(id, m.get(id) ?? 0);
          return nuevo;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaActual]);

  // Miniaturas de carpeta solo para los modelos de la página que no tienen foto por color.
  useEffect(() => {
    const faltan = paginaActual
      .filter((e) => e.modelo && !imagenColorDeModelo(e.modelo, e.color) && !carpetasPedidas.current.has(e.modelo))
      .map((e) => e.modelo as string);
    if (faltan.length === 0) return;
    for (const m of faltan) carpetasPedidas.current.add(m);
    obtenerImagenesDeCarpetas(supabase, faltan)
      .then((nuevas) => {
        if (nuevas.size > 0) setImagenesCarpetas((prev) => new Map([...prev, ...nuevas]));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaActual]);
  const imagenDe = useCallback(
    (e: EquipoStandby) => imagenColorDeModelo(e.modelo, e.color) ?? imagenPorNombreExacto(e.modelo, imagenesCarpetas),
    [imagenesCarpetas]
  );

  // Fotos reales del equipo elegido: se piden recién cuando se elige (y se recuerdan), no las de toda la lista.
  useEffect(() => {
    if (!seleccionId || fotosDeEquipo.has(seleccionId)) return;
    const id = seleccionId;
    // Si ya se sabe que no tiene fotos no hace falta preguntar.
    if (fotos.get(id) === 0) {
      setFotosDeEquipo((prev) => new Map(prev).set(id, { cargando: false, fotos: [], error: false }));
      return;
    }
    setFotosDeEquipo((prev) => new Map(prev).set(id, { cargando: true, fotos: [], error: false }));
    (async () => {
      if (!(await soportaMigracion(supabase, 'fotosDispositivo'))) {
        setFotosDeEquipo((prev) => new Map(prev).set(id, { cargando: false, fotos: [], error: false }));
        return;
      }
      const r = await obtenerFotos(supabase, id);
      setFotosDeEquipo((prev) => new Map(prev).set(id, 'error' in r ? { cargando: false, fotos: [], error: true } : { cargando: false, fotos: r, error: false }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionId]);

  // Hace la acción y, si salió bien, actualiza la lista acá mismo (sin volver a pedir todo a la base).
  const accion = async (e: EquipoStandby, tarea: () => Promise<string | null>, alExito: (prev: EquipoStandby[]) => EquipoStandby[]) => {
    setProcesando(e.id);
    const mensaje = await tarea();
    setProcesando(null);
    if (mensaje) {
      alert(`${t('No se pudo guardar el cambio. No se modificó nada.')}
${t(mensaje)}`);
      // Si lo movió otra persona, la lista quedó vieja: se vuelve a pedir.
      if (mensaje === ERR_YA_NO_ESTA_EN_STANDBY) await cargar();
      return;
    }
    setEquipos(alExito);
    setDetalleAbierto(false);
  };
  const sacar = (id: string) => (prev: EquipoStandby[]) => prev.filter((x) => x.id !== id);

  const alStock = (e: EquipoStandby) => {
    if (!puedeAgregarStock) return;
    if (!confirm(`${t('¿Volver')} ${e.modelo || t('este equipo')} ${t('al Stock como disponible para vender?')}`)) return;
    accion(e, async () => (await volverAlStock(supabase, e)).error, sacar(e.id));
  };

  // Para vender hay que pasarlo al Stock (es lo que usa Nueva Orden) y se abre la orden con el equipo ya cargado.
  const vender = async (e: EquipoStandby) => {
    if (!puedeVender || !puedeAgregarStock) return;
    // Un equipo señado está reservado para un cliente: se entrega desde su plan de ahorro, no se vende a otra persona.
    if (senados.has(e.id)) {
      alert(t('Este equipo está señado por un plan de ahorro. Entregalo desde ese plan.'));
      return;
    }
    if (!confirm(`${t('Para vender')} ${e.modelo || t('este equipo')} ${t('se pasa al Stock y se abre una orden nueva con el equipo cargado. ¿Seguimos?')}`)) return;
    setProcesando(e.id);
    const { error: errorStock } = await volverAlStock(supabase, e);
    setProcesando(null);
    if (errorStock) {
      alert(`${t('No se pudo guardar el cambio. No se modificó nada.')}\n${t(errorStock)}`);
      if (errorStock === ERR_YA_NO_ESTA_EN_STANDBY) await cargar();
      return;
    }
    router.push(`/ordenes/nueva?dispositivoId=${e.id}`);
  };

  const aServicio = (e: EquipoStandby) => {
    if (!puedeServicio) return;
    if (!confirm(`${t('¿Derivar')} ${e.modelo || t('este equipo')} ${t('a Servicio Técnico? Sale de Standby y aparece ahí para diagnosticarlo.')}`)) return;
    accion(e, async () => (await derivarStandbyAServicio(supabase, e)).error, sacar(e.id));
  };

  const eliminar = (e: EquipoStandby) => {
    if (!puedeEliminar) return;
    if (senados.has(e.id)) {
      alert(t('Este equipo está señado por un plan de ahorro. Cancelá o eliminá ese plan antes de borrarlo.'));
      return;
    }
    if (!confirm(`${t('¿Eliminar')} ${e.modelo || t('este equipo')} ${t('del sistema? No se puede deshacer.')}`)) return;
    accion(e, async () => {
      const { error: errorBorrado } = await supabase.from('dispositivos').delete().eq('id', e.id);
      if (errorBorrado) return errorBorrado.message;
      await registrarAuditoria(supabase, {
        accion: `eliminó el equipo ${e.modelo || 'sin modelo'}${e.imei ? ` (IMEI ${e.imei})` : ''} de Standby`,
        entidad: 'dispositivo',
        entidadId: e.id,
      });
      return null;
    }, sacar(e.id));
  };

  const elegir = useCallback((id: string) => {
    setSeleccionId(id);
    setDetalleAbierto(true);
  }, []);

  // Navegación con teclado en la lista: flechas, Inicio y Fin cambian de equipo; Enter abre la ficha en pantallas chicas.
  const listaRef = useRef<HTMLDivElement>(null);
  const alTeclear = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = paginaActual.findIndex((e) => e.id === seleccionId);
    let destino = -1;
    if (ev.key === 'ArrowDown') destino = Math.min(paginaActual.length - 1, idx + 1);
    else if (ev.key === 'ArrowUp') destino = Math.max(0, idx - 1);
    else if (ev.key === 'Home') destino = 0;
    else if (ev.key === 'End') destino = paginaActual.length - 1;
    else if (ev.key === 'Enter' && idx >= 0) {
      setDetalleAbierto(true);
      return;
    }
    if (destino < 0 || paginaActual.length === 0) return;
    ev.preventDefault();
    const id = paginaActual[destino].id;
    setSeleccionId(id);
    requestAnimationFrame(() => {
      const el = listaRef.current?.querySelector<HTMLElement>(`[data-equipo-id="${id}"]`);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    });
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroOrigen(null);
    setSoloAntiguos(false);
  };

  if (activo === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary max-w-sm">
          {t('Standby todavía no está activado en este negocio. Pedile al administrador que corra standby_supabase.sql.')}
        </p>
        <Link href="/stock" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Ir a Stock')}
        </Link>
      </main>
    );
  }

  const totalSucursal = enSucursal.length;
  const nombreSucursal = (id: string | null) => sucursales.find((s) => s.id === id)?.nombre ?? (sucursales.length > 1 ? t('Sin sucursal') : null);

  return (
    <main className="flex min-h-screen flex-col gap-4 px-4 py-5 lg:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" aria-label={t('Volver al inicio')} className="text-2xl leading-none lg:hidden">
          &larr;
        </Link>
        <div className="min-w-0 mr-auto">
          <h1 className="font-display text-xl font-semibold leading-tight text-ink dark:text-dark-text">{t('Standby')}</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {loading ? t('Cargando...') : `${totalSucursal} ${totalSucursal === 1 ? t('equipo') : t('equipos')}`}
            {!loading && cantidadAntiguos > 0 && !hayFiltros && (
              <>
                {' · '}
                <span className="text-warn">
                  {cantidadAntiguos} {t('con más de')} {DIAS_ANTIGUO_EN_STANDBY} {t('días')}
                </span>
              </>
            )}
          </p>
        </div>
        <Link href="/stock" className="text-xs text-accent dark:text-dark-accent hover:underline">
          {t('Ir a Stock')}
        </Link>
        {puedeAgregarStock && (
          <Boton variante="primario" tamano="sm" onClick={() => setModalNuevo(true)} className="!rounded-md">
            + {t('Agregar equipo')}
          </Boton>
        )}
      </header>

      <p className="-mt-2 max-w-3xl text-xs text-muted dark:text-dark-text-secondary">
        {t('Equipos con detalles o en espera: no cuentan como Stock para vender ni ocupan lugar en Servicio Técnico. Desde acá pueden volver al Stock, venderse o ir a reparar.')}
      </p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          <span className="min-w-0 flex-1">{error}</span>
          <Boton variante="secundario" tamano="sm" onClick={cargar}>
            {t('Reintentar')}
          </Boton>
        </div>
      )}

      <div className="flex min-h-[26rem] flex-1 flex-col overflow-hidden rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface lg:h-[calc(100dvh-10.5rem)] lg:min-h-[30rem] lg:flex-none lg:flex-row">
        {/* Lista */}
        <div
          className={`${detalleAbierto ? 'hidden lg:flex' : 'flex'} min-h-0 flex-1 flex-col border-border dark:border-dark-border lg:w-[26rem] lg:flex-none lg:border-r xl:w-[29rem]`}
        >
          <div className="flex flex-col gap-2 border-b border-border dark:border-dark-border p-3">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('Buscar por modelo, IMEI, color, detalle...')}
              aria-label={t('Buscar en Standby')}
              className="h-9 w-full rounded-md border border-border dark:border-dark-border bg-canvas dark:bg-dark-bg px-3 text-sm text-ink dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="orden-standby">
                {t('Ordenar por')}
              </label>
              <select id="orden-standby" value={orden} onChange={(e) => setOrden(e.target.value as CriterioOrdenStandby)} className={controlChico}>
                <option value="antiguos">{t('Más antiguos primero')}</option>
                <option value="recientes">{t('Más recientes primero')}</option>
                <option value="modelo">{t('Por modelo')}</option>
              </select>
              {sucursales.length > 1 && (
                <select
                  value={filtroSucursal}
                  onChange={(e) => setFiltroSucursal(e.target.value)}
                  aria-label={t('Filtrar por sucursal')}
                  className={`${controlChico} min-w-0 max-w-[10rem]`}
                >
                  <option value="">{t('Todas las sucursales')}</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              )}
              <span className="ml-auto text-[11px] tabular-nums text-muted dark:text-dark-text-secondary" aria-live="polite">
                {hayFiltros ? `${visibles.length} ${t('de')} ${totalSucursal}` : ''}
              </span>
            </div>
            {!loading && totalSucursal > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Filtros')}>
                <button
                  type="button"
                  aria-pressed={filtroOrigen === null && !soloAntiguos}
                  onClick={() => {
                    setFiltroOrigen(null);
                    setSoloAntiguos(false);
                  }}
                  className={chip(filtroOrigen === null && !soloAntiguos)}
                >
                  {t('Todos')} <span className="tabular-nums opacity-70">{buscados.length}</span>
                </button>
                {ORIGENES.filter((o) => conteoOrigen[o] > 0 || filtroOrigen === o).map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={filtroOrigen === o}
                    onClick={() => setFiltroOrigen(filtroOrigen === o ? null : o)}
                    className={chip(filtroOrigen === o)}
                  >
                    {o === 'sin_origen' ? t('Sin origen') : t(ETIQUETA_ORIGEN_STANDBY[o])} <span className="tabular-nums opacity-70">{conteoOrigen[o]}</span>
                  </button>
                ))}
                {(cantidadAntiguos > 0 || soloAntiguos) && (
                  <button type="button" aria-pressed={soloAntiguos} onClick={() => setSoloAntiguos((v) => !v)} className={chip(soloAntiguos)}>
                    +{DIAS_ANTIGUO_EN_STANDBY} {t('días')} <span className="tabular-nums opacity-70">{cantidadAntiguos}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div ref={listaRef} role="listbox" aria-label={t('Equipos en Standby')} onKeyDown={alTeclear} className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div aria-busy="true" aria-label={t('Cargando...')}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border dark:border-dark-border px-3 py-3">
                    <div className="h-11 w-11 animate-pulse rounded-md bg-canvas dark:bg-dark-bg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-canvas dark:bg-dark-bg" />
                      <div className="h-2.5 w-1/2 animate-pulse rounded bg-canvas dark:bg-dark-bg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <p className="text-sm text-muted dark:text-dark-text-secondary">
                  {hayFiltros ? t('Ningún equipo coincide con la búsqueda.') : t('No hay equipos en Standby.')}
                </p>
                {hayFiltros ? (
                  <Boton variante="secundario" tamano="sm" onClick={limpiarFiltros}>
                    {t('Quitar filtros')}
                  </Boton>
                ) : (
                  <>
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      {t('Mandalos desde Stock, desde Plan Canje o desde Servicio Técnico, o cargá uno acá.')}
                    </p>
                    {puedeAgregarStock && (
                      <Boton variante="primario" tamano="sm" onClick={() => setModalNuevo(true)}>
                        + {t('Agregar equipo')}
                      </Boton>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {paginaActual.map((e) => (
                  <FilaStandby
                    key={e.id}
                    equipo={e}
                    imagen={imagenDe(e)}
                    seleccionado={e.id === seleccionId}
                    senado={senados.has(e.id)}
                    fotos={fotos.get(e.id) ?? 0}
                    alElegir={elegir}
                  />
                ))}
                {visibles.length > limite && (
                  <div className="flex justify-center p-3">
                    <Boton variante="secundario" tamano="sm" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                      {t('Mostrar más')} ({visibles.length - limite})
                    </Boton>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Ficha del equipo elegido */}
        <div className={`${detalleAbierto ? 'block' : 'hidden lg:block'} min-h-0 min-w-0 flex-1 overflow-y-auto`}>
          {seleccionado ? (
            <DetalleStandby
              key={seleccionado.id}
              equipo={seleccionado}
              imagen={imagenDe(seleccionado)}
              senado={senados.has(seleccionado.id)}
              sucursalNombre={nombreSucursal(seleccionado.sucursal_id)}
              simbolo={simboloMoneda(moneda)}
              verCostos={puedeVerCostos}
              fotos={fotosDeEquipo.get(seleccionado.id) ?? { cargando: true, fotos: [], error: false }}
              ocupado={procesando === seleccionado.id}
              puedeAlStock={puedeAgregarStock}
              puedeVender={puedeVender && puedeAgregarStock}
              puedeServicio={puedeServicio}
              puedeEditar={puedeAgregarStock}
              puedeEliminar={puedeEliminar}
              alStock={() => alStock(seleccionado)}
              vender={() => vender(seleccionado)}
              aServicio={() => aServicio(seleccionado)}
              editarDetalle={() => setEditandoMotivo(seleccionado)}
              eliminar={() => eliminar(seleccionado)}
              volverALista={() => setDetalleAbierto(false)}
            />
          ) : (
            <div className="hidden h-full min-h-[18rem] flex-col items-center justify-center gap-1 px-6 text-center lg:flex">
              <p className="text-sm font-medium text-ink dark:text-dark-text">{loading ? t('Cargando...') : t('Elegí un equipo de la lista')}</p>
              {!loading && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Acá vas a ver sus datos, fotos y lo que podés hacer con él.')}</p>}
            </div>
          )}
        </div>
      </div>

      {modalNuevo && (
        <ModalNuevoEquipo
          sucursales={sucursales}
          sucursalId={sucursalActual.id ?? (filtroSucursal || null)}
          onClose={() => setModalNuevo(false)}
          onGuardado={() => {
            setModalNuevo(false);
            cargar();
          }}
        />
      )}
      {editandoMotivo && (
        <ModalMotivo
          equipo={editandoMotivo}
          onClose={() => setEditandoMotivo(null)}
          onGuardado={(motivo) => {
            // Se actualiza la ficha acá mismo, sin volver a pedir toda la lista.
            setEquipos((prev) => prev.map((x) => (x.id === editandoMotivo.id ? { ...x, espera_motivo: motivo } : x)));
            setEditandoMotivo(null);
          }}
        />
      )}
    </main>
  );
}
