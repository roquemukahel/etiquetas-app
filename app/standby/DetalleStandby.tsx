'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { EquipoStandby } from '../lib/standby';
import { diasEnStandby, esAntiguoEnStandby, ETIQUETA_ORIGEN_STANDBY } from '../lib/standby';
import type { FotoDispositivo } from '../lib/fotosDispositivo';
import { formatearFechaYHoraCorta } from '../lib/fechas';
import { formatearMonto } from '../lib/numeros';
import { formatearGB } from '../lib/almacenamiento';
import { Boton } from '../Boton';
import Modal from '../Modal';
import { useT } from '../lib/idioma';

// Ficha del equipo elegido. De arriba hacia abajo: quién es, qué se puede hacer con él (lo más usado primero, lo
// destructivo al final y aparte), por qué está esperando (separado de sus datos técnicos) y fotos. Sin tarjetas
// anidadas: secciones separadas por líneas finas, que es lo que permite ver todo sin desplazarse mucho.

export type FotosDeEquipo = { cargando: boolean; fotos: FotoDispositivo[]; error: boolean };

type Props = {
  equipo: EquipoStandby;
  imagen: string | null;
  senado: boolean;
  sucursalNombre: string | null;
  simbolo: string;
  verCostos: boolean;
  fotos: FotosDeEquipo;
  ocupado: boolean;
  puedeAlStock: boolean;
  puedeVender: boolean;
  puedeServicio: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  alStock: () => void;
  vender: () => void;
  aServicio: () => void;
  editarDetalle: () => void;
  eliminar: () => void;
  volverALista: () => void;
};

const titulo = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-muted dark:text-dark-text-secondary';

export default function DetalleStandby(p: Props) {
  const t = useT();
  const e = p.equipo;
  const [motivoAbierto, setMotivoAbierto] = useState(false);
  const [fotoAbierta, setFotoAbierta] = useState<FotoDispositivo | null>(null);
  const [copiado, setCopiado] = useState(false);

  const desde = e.en_espera_desde ?? e.created_at;
  const dias = diasEnStandby(desde);
  const antiguo = esAntiguoEnStandby(e);
  const motivo = (e.espera_motivo || e.detalles || '').trim();
  const motivoLargo = motivo.length > 220 || motivo.split('\n').length > 4;
  const bateriaBaja = e.salud_bateria != null && e.salud_bateria < 80;

  const copiarImei = async () => {
    if (!e.imei) return;
    try {
      await navigator.clipboard.writeText(e.imei);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso del navegador para copiar: no pasa nada, el IMEI sigue a la vista para copiarlo a mano.
    }
  };

  const dato = (nombre: string, valor: React.ReactNode, mono = false) => (
    <div className="min-w-0">
      <dt className={titulo}>{nombre}</dt>
      <dd className={`mt-0.5 truncate text-sm text-ink dark:text-dark-text ${mono ? 'font-mono tracking-tight' : ''}`}>{valor ?? '—'}</dd>
    </div>
  );

  return (
    <section aria-label={t('Detalle del equipo')} className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={p.volverALista}
        className="lg:hidden flex items-center gap-1.5 border-b border-border dark:border-dark-border px-4 py-2.5 text-left text-xs font-medium text-accent dark:text-dark-accent"
      >
        <span aria-hidden="true">&larr;</span> {t('Volver a la lista')}
      </button>

      {/* Quién es */}
      <div className="flex items-start gap-4 px-5 pt-5 pb-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-canvas dark:bg-dark-bg">
          {p.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imagen} alt="" decoding="async" width={96} height={96} className="h-[88px] w-[88px] object-contain" />
          ) : (
            <span aria-hidden="true" className="text-3xl opacity-50">
              📱
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold leading-tight text-ink dark:text-dark-text break-words">
            {e.modelo || t('Sin modelo')}
          </h2>
          <p className="mt-0.5 text-sm text-muted dark:text-dark-text-secondary">
            {[e.capacidad_gb ? formatearGB(e.capacidad_gb) : null, e.color].filter(Boolean).join(' · ') || t('Sin datos de capacidad ni color')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.senado && (
              <span className="rounded-sm bg-accent-soft dark:bg-dark-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent dark:text-dark-accent">
                {t('SEÑADO')}
              </span>
            )}
            {e.espera_origen && (
              <span className="rounded-sm border border-border dark:border-dark-border px-1.5 py-0.5 text-[10px] font-medium text-muted dark:text-dark-text-secondary">
                {t('Viene de')} {t(ETIQUETA_ORIGEN_STANDBY[e.espera_origen])}
              </span>
            )}
            {p.sucursalNombre && (
              <span className="rounded-sm border border-border dark:border-dark-border px-1.5 py-0.5 text-[10px] font-medium text-muted dark:text-dark-text-secondary">
                {p.sucursalNombre}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-display text-2xl font-semibold leading-none tabular-nums ${dias >= 60 ? 'text-bad' : antiguo ? 'text-warn' : 'text-ink dark:text-dark-text'}`}>
            {dias}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{dias === 1 ? t('día en Standby') : t('días en Standby')}</p>
        </div>
      </div>

      {/* Qué se puede hacer: lo habitual primero, lo destructivo aparte */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border dark:border-dark-border px-5 py-3">
        {p.puedeAlStock && (
          <Boton variante="exito" tamano="md" disabled={p.ocupado} onClick={p.alStock} className="!rounded-md">
            {t('Volver al Stock')}
          </Boton>
        )}
        {p.puedeVender && (
          <span title={p.senado ? t('Este equipo está señado por un plan de ahorro. Entregalo desde ese plan.') : undefined}>
            <Boton variante="primario" tamano="md" disabled={p.ocupado || p.senado} onClick={p.vender} className="!rounded-md">
              {t('Vender')}
            </Boton>
          </span>
        )}
        {p.puedeServicio && (
          <Boton variante="secundario" tamano="md" disabled={p.ocupado} onClick={p.aServicio} className="!rounded-md">
            {t('A Servicio Técnico')}
          </Boton>
        )}
        <span className="mx-1 hidden h-5 w-px bg-border dark:bg-dark-border sm:inline-block" aria-hidden="true" />
        {p.puedeEditar && (
          <Boton variante="ghost" tamano="md" disabled={p.ocupado} onClick={p.editarDetalle} className="!rounded-md">
            {t('Editar detalle')}
          </Boton>
        )}
        <Link
          href={`/stock/${e.id}`}
          className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-ink dark:text-dark-text hover:bg-canvas dark:hover:bg-dark-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent"
        >
          {t('Ficha y fotos')}
        </Link>
        {p.puedeEliminar && (
          <Boton variante="peligro" tamano="md" disabled={p.ocupado} onClick={p.eliminar} className="!rounded-md sm:ml-auto">
            {t('Eliminar')}
          </Boton>
        )}
      </div>

      {/* Por qué espera */}
      <div className="px-5 py-4 border-b border-border dark:border-dark-border">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warn">{t('Motivo de espera')}</h3>
          {motivoLargo && (
            <button
              type="button"
              onClick={() => setMotivoAbierto((v) => !v)}
              aria-expanded={motivoAbierto}
              className="text-xs font-medium text-accent dark:text-dark-accent hover:underline"
            >
              {motivoAbierto ? t('Ver menos') : t('Ver todo')}
            </button>
          )}
        </div>
        {motivo ? (
          <p className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink dark:text-dark-text ${motivoAbierto ? '' : 'line-clamp-4'}`}>{motivo}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted dark:text-dark-text-secondary">{t('Sin detalle cargado')}</p>
        )}
      </div>

      {/* Datos técnicos */}
      <div className="px-5 py-4 border-b border-border dark:border-dark-border">
        <h3 className={titulo}>{t('Características')}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className={titulo}>IMEI</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-sm text-ink dark:text-dark-text">
              <span className="truncate font-mono tracking-tight">{e.imei || '—'}</span>
              {e.imei && (
                <button
                  type="button"
                  onClick={copiarImei}
                  className="shrink-0 rounded-sm border border-border dark:border-dark-border px-1.5 py-0.5 text-[10px] font-medium text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text"
                >
                  {copiado ? t('Copiado') : t('Copiar')}
                </button>
              )}
            </dd>
          </div>
          {dato(t('Número de serie'), e.numero_serie, true)}
          <div className="min-w-0">
            <dt className={titulo}>{t('Batería')}</dt>
            <dd className={`mt-0.5 text-sm tabular-nums ${bateriaBaja ? 'text-warn' : 'text-ink dark:text-dark-text'}`}>
              {e.salud_bateria != null ? `${e.salud_bateria}%` : '—'}
            </dd>
          </div>
          {dato(t('Estado'), e.estado === 'sellado' ? t('Sellado') : e.estado === 'usado' ? t('Usado') : e.estado)}
          {dato(t('Precio'), e.precio != null ? `${p.simbolo}${formatearMonto(e.precio)}` : null)}
          {p.verCostos && dato(t('Costo'), e.costo != null ? `${p.simbolo}${formatearMonto(e.costo)}` : null)}
        </dl>
      </div>

      {/* Historial de la espera */}
      <div className="px-5 py-4 border-b border-border dark:border-dark-border">
        <h3 className={titulo}>{t('En Standby')}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
          {dato(t('Desde'), formatearFechaYHoraCorta(desde) || null)}
          {dato(t('Origen'), e.espera_origen ? t(ETIQUETA_ORIGEN_STANDBY[e.espera_origen]) : null)}
          {dato(t('Sucursal'), p.sucursalNombre)}
        </dl>
      </div>

      {/* Fotos reales */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className={titulo}>{t('Fotos')}</h3>
          <Link href={`/stock/${e.id}`} className="text-xs font-medium text-accent dark:text-dark-accent hover:underline">
            {p.fotos.fotos.length > 0 ? t('Administrar fotos') : t('Agregar fotos')}
          </Link>
        </div>
        {p.fotos.cargando ? (
          <div className="mt-3 flex gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 w-20 animate-pulse rounded-md bg-canvas dark:bg-dark-bg" />
            ))}
          </div>
        ) : p.fotos.error ? (
          <p className="mt-2 text-sm text-muted dark:text-dark-text-secondary">{t('No pudimos cargar las fotos.')}</p>
        ) : p.fotos.fotos.length === 0 ? (
          <p className="mt-2 text-sm text-muted dark:text-dark-text-secondary">{t('Este equipo no tiene fotos reales cargadas.')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {p.fotos.fotos.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setFotoAbierta(f)}
                  aria-label={`${t('Ver foto')} ${i + 1}`}
                  className="block h-20 w-20 overflow-hidden rounded-md border border-border dark:border-dark-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.miniatura_url || f.foto_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {fotoAbierta && (
        <Modal titulo={`${e.modelo || t('Equipo')} · ${t('Foto')}`} onClose={() => setFotoAbierta(null)} maxWidth="max-w-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoAbierta.foto_url} alt={e.modelo || ''} className="max-h-[70vh] w-full rounded-md object-contain" />
        </Modal>
      )}
    </section>
  );
}
