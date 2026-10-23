'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { soportaMigracion } from '../lib/migraciones';
import { obtenerTodasLasFilas } from '../lib/db';
import { simboloMoneda } from '../lib/monedas';
import { formatearMonto } from '../lib/numeros';
import { contarFotosDe } from '../lib/fotosDispositivo';
import { obtenerDispositivosSenados } from '../lib/planAhorro';
import { registrarAuditoria } from '../lib/auditoria';
import {
  COLUMNAS_STANDBY,
  ETIQUETA_ORIGEN_STANDBY,
  buscarEnIndice,
  indexarStandby,
  crearEquipoEnStandby,
  derivarStandbyAServicio,
  diasEnStandby,
  ordenarStandby,
  volverAlStock,
  ERR_YA_NO_ESTA_EN_STANDBY,
  type EquipoStandby,
} from '../lib/standby';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { Boton } from '../Boton';
import { QCard } from '../QCard';
import Modal from '../Modal';
import { useT } from '../lib/idioma';
import { formatearGB } from '../lib/almacenamiento';

// Cuántos equipos se dibujan por vez: con cientos o miles en Standby la pantalla abre igual de rápido y se pide "Mostrar más".
const POR_PAGINA = 40;

const campo = 'w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';
const etiqueta = 'text-xs text-muted dark:text-dark-text-secondary block mb-1';

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
  const [busqueda, setBusqueda] = useState('');
  // Mientras se escribe, la lista se actualiza con un pequeño retraso para que el teclado no se trabe.
  const busquedaDiferida = useDeferredValue(busqueda);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editandoMotivo, setEditandoMotivo] = useState<EquipoStandby | null>(null);

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

  // El texto de búsqueda de cada equipo se arma una sola vez (al cargar), no en cada tecla.
  const indice = useMemo(() => indexarStandby(equipos), [equipos]);
  const enSucursal = useMemo(
    () => (filtroSucursal ? indice.filter((i) => i.equipo.sucursal_id === filtroSucursal) : indice),
    [indice, filtroSucursal]
  );
  const visibles = useMemo(() => ordenarStandby(buscarEnIndice(enSucursal, busquedaDiferida)), [enSucursal, busquedaDiferida]);
  // Al cambiar la búsqueda o la sucursal se vuelve a la primera página.
  useEffect(() => {
    setLimite(POR_PAGINA);
  }, [busquedaDiferida, filtroSucursal]);
  const paginaActual = useMemo(() => visibles.slice(0, limite), [visibles, limite]);

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
    if (!tienePermiso(actor, 'eliminar')) return;
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

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Standby')}</span>
        <Link href="/stock" className="ml-auto text-xs text-accent dark:text-dark-accent underline">
          {t('Ir a Stock')}
        </Link>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Equipos con detalles o en espera: no cuentan como Stock para vender ni ocupan lugar en Servicio Técnico. Desde acá pueden volver al Stock, venderse o ir a reparar.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('Buscar por modelo, IMEI, color, detalle...')}
        aria-label={t('Buscar en Standby')}
        className={campo}
      />

      <div className="flex flex-wrap items-center gap-2">
        {sucursales.length > 1 && (
          <select
            value={filtroSucursal}
            onChange={(e) => setFiltroSucursal(e.target.value)}
            aria-label={t('Filtrar por sucursal')}
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
          >
            <option value="">🏬 {t('Todas las sucursales')}</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                🏬 {s.nombre}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-muted dark:text-dark-text-secondary">
          {busqueda.trim() ? `${visibles.length} ${t('de')} ${enSucursal.length}` : enSucursal.length} {!busqueda.trim() && enSucursal.length === 1 ? t('equipo en Standby') : t('equipos en Standby')}
        </span>
        {puedeAgregarStock && (
          <Boton variante="primario" tamano="sm" onClick={() => setModalNuevo(true)} className="ml-auto">
            + {t('Agregar equipo')}
          </Boton>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : visibles.length === 0 ? (
        <QCard padding="md" className="text-center">
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {busqueda.trim() ? t('Ningún equipo coincide con la búsqueda.') : t('No hay equipos en Standby.')}
          </p>
          {!busqueda.trim() && (
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">
              {t('Mandalos desde Stock, desde Plan Canje o desde Servicio Técnico, o cargá uno acá.')}
            </p>
          )}
        </QCard>
      ) : (
        <div className="flex flex-col gap-2">
          {paginaActual.map((e) => {
            const dias = diasEnStandby(e.en_espera_desde ?? e.created_at);
            const ocupado = procesando === e.id;
            return (
              <div key={e.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {e.modelo || t('Sin modelo')}
                      {e.capacidad_gb ? ` ${formatearGB(e.capacidad_gb)}` : ''}
                      {e.color ? ` · ${e.color}` : ''}
                      {senados.has(e.id) && (
                        <span className="ml-2 align-middle text-[10px] font-semibold text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-2 py-0.5">
                          {t('SEÑADO')}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                      {e.imei || t('sin IMEI')}
                      {e.salud_bateria != null ? ` · ${t('Batería')} ${e.salud_bateria}%` : ''}
                      {(fotos.get(e.id) ?? 0) > 0 ? ` · 📷 ${fotos.get(e.id)}` : ''}
                      {sucursales.length > 1 ? ` · 🏬 ${sucursales.find((s) => s.id === e.sucursal_id)?.nombre ?? t('Sin sucursal')}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {e.precio != null && (
                      <p className="text-sm font-medium tabular-nums">
                        {simboloMoneda('ARS')}
                        {formatearMonto(e.precio)}
                      </p>
                    )}
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                      {dias === 0 ? t('desde hoy') : `${dias} ${dias === 1 ? t('día') : t('días')}`}
                      {e.espera_origen ? ` · ${t(ETIQUETA_ORIGEN_STANDBY[e.espera_origen])}` : ''}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-warn/10 px-3 py-2">
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t('Qué le pasa')}</p>
                  <p className="text-xs whitespace-pre-wrap">{e.espera_motivo || e.detalles || t('Sin detalle cargado')}</p>
                </div>

                {puedeVerCostos && e.costo != null && (
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                    {t('Costo')}: {simboloMoneda('ARS')}
                    {formatearMonto(e.costo)}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {puedeAgregarStock && (
                    <Boton variante="exito" tamano="sm" disabled={ocupado} onClick={() => alStock(e)}>
                      {t('Volver al Stock')}
                    </Boton>
                  )}
                  {puedeVender && puedeAgregarStock && (
                    <span title={senados.has(e.id) ? t('Este equipo está señado por un plan de ahorro. Entregalo desde ese plan.') : undefined}>
                      <Boton variante="primario" tamano="sm" disabled={ocupado || senados.has(e.id)} onClick={() => vender(e)}>
                        {t('Vender')}
                      </Boton>
                    </span>
                  )}
                  {puedeServicio && (
                    <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => aServicio(e)}>
                      {t('A Servicio Técnico')}
                    </Boton>
                  )}
                  {puedeAgregarStock && (
                    <Boton variante="ghost" tamano="sm" disabled={ocupado} onClick={() => setEditandoMotivo(e)}>
                      {t('Editar detalle')}
                    </Boton>
                  )}
                  <Link
                    href={`/stock/${e.id}`}
                    className="inline-flex items-center rounded-lg border border-border dark:border-dark-border px-3 h-8 text-xs font-medium"
                  >
                    {t('Ficha y fotos')}
                  </Link>
                  {tienePermiso(actor, 'eliminar') && (
                    <Boton variante="ghost" tamano="sm" disabled={ocupado} onClick={() => eliminar(e)} className="text-bad">
                      {t('Eliminar')}
                    </Boton>
                  )}
                </div>
              </div>
            );
          })}
          {visibles.length > limite && (
            <Boton variante="secundario" tamano="md" onClick={() => setLimite((l) => l + POR_PAGINA)} className="self-center">
              {t('Mostrar más')} ({visibles.length - limite})
            </Boton>
          )}
        </div>
      )}

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
            // Se actualiza la tarjeta acá mismo, sin volver a pedir toda la lista.
            setEquipos((prev) => prev.map((x) => (x.id === editandoMotivo.id ? { ...x, espera_motivo: motivo } : x)));
            setEditandoMotivo(null);
          }}
        />
      )}
    </main>
  );
}

function ModalNuevoEquipo({ sucursales, sucursalId, onClose, onGuardado }: { sucursales: Sucursal[]; sucursalId: string | null; onClose: () => void; onGuardado: () => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [color, setColor] = useState('');
  const [imei, setImei] = useState('');
  const [motivo, setMotivo] = useState('');
  // Con varias sucursales hay que elegir a cuál pertenece el equipo, si no queda fuera de los filtros por sucursal.
  const [sucursalElegida, setSucursalElegida] = useState(sucursalId ?? (sucursales.length === 1 ? sucursales[0].id : ''));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!modelo.trim()) {
      setError(t('Poné el modelo del equipo.'));
      return;
    }
    if (sucursales.length > 1 && !sucursalElegida) {
      setError(t('Elegí una sucursal.'));
      return;
    }
    const quien = getActor();
    if (!quien) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await crearEquipoEnStandby(supabase, {
      modelo,
      capacidadGb: capacidad ? Number(capacidad) : null,
      color,
      imei,
      motivo,
      sucursalId: sucursalElegida || null,
      actor: quien,
    });
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    onGuardado();
  };

  return (
    <Modal titulo={t('Agregar equipo a Standby')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className={etiqueta}>{t('Modelo')}</label>
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="iPhone 13" className={campo} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta}>{t('Capacidad (GB)')}</label>
            <input value={capacidad} onChange={(e) => setCapacidad(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={campo} />
          </div>
          <div>
            <label className={etiqueta}>{t('Color')}</label>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={campo} />
          </div>
        </div>
        <div>
          <label className={etiqueta}>IMEI</label>
          <input value={imei} onChange={(e) => setImei(e.target.value)} inputMode="numeric" className={campo} />
        </div>
        {sucursales.length > 1 && (
          <div>
            <label className={etiqueta}>{t('Sucursal')}</label>
            <select value={sucursalElegida} onChange={(e) => setSucursalElegida(e.target.value)} className={campo}>
              <option value="">{t('Elegí una sucursal')}</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={etiqueta}>{t('Qué le pasa')}</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder={t('Ej. Pantalla rota, no carga, esperando repuesto')} className={campo} />
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={guardar} className="flex-1">
            {t('Agregar a Standby')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

function ModalMotivo({ equipo, onClose, onGuardado }: { equipo: EquipoStandby; onClose: () => void; onGuardado: (motivo: string | null) => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [motivo, setMotivo] = useState(equipo.espera_motivo ?? equipo.detalles ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const { error: errorUpdate } = await supabase.from('dispositivos').update({ espera_motivo: motivo.trim() || null }).eq('id', equipo.id);
    setGuardando(false);
    if (errorUpdate) {
      setError(errorUpdate.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `editó el detalle de ${equipo.modelo || 'un equipo'}${equipo.imei ? ` (IMEI ${equipo.imei})` : ''} en Standby`,
      entidad: 'dispositivo',
      entidadId: equipo.id,
    });
    onGuardado(motivo.trim() || null);
  };

  return (
    <Modal titulo={`${t('Qué le pasa')} · ${equipo.modelo || t('Equipo')}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} className={campo} autoFocus />
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={guardar} className="flex-1">
            {t('Guardar cambios')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
