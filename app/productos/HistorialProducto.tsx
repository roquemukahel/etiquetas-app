'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { formatearFechaHora } from '../lib/fechas';
import { useIdioma, useT } from '../lib/idioma';
import { localeDe } from '../lib/i18n/traducir';
import {
  cambiosDeAuditoria,
  ETIQUETA_TIPO_MOVIMIENTO,
  procesarMovimientos,
  type MovimientoCrudo,
  type MovimientoVista,
} from '../lib/historialProducto';
import Modal from '../Modal';

type AuditoriaFila = {
  id: string;
  actor_nombre: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  created_at: string;
};

const PASO = 100;

// "Historial" de un producto: de un lado los movimientos de stock (quién
// vendió, devolvió, ajustó o ingresó cada unidad), del otro las modificaciones
// (quién cambió precio, costo o cantidad). Pensado para rastrear una diferencia
// de unidades: "tengo 25 y el sistema decía 26 — ¿quién lo tocó?".
export default function HistorialProducto({
  nombre,
  productoIds,
  maestroId,
  stockActual,
  sucursalPorProducto,
  puedeVerModificaciones,
  onClose,
}: {
  nombre: string;
  productoIds: string[];
  maestroId: string | null;
  stockActual: number;
  // id de fila de productos → nombre de su sucursal (solo si el negocio tiene más de una).
  sucursalPorProducto: Map<string, string>;
  puedeVerModificaciones: boolean;
  onClose: () => void;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const locale = localeDe(useIdioma());
  const [pestana, setPestana] = useState<'movimientos' | 'modificaciones'>('movimientos');
  const [movimientos, setMovimientos] = useState<MovimientoCrudo[]>([]);
  const [hayMasMovimientos, setHayMasMovimientos] = useState(false);
  const [limite, setLimite] = useState(PASO);
  const [cargandoMov, setCargandoMov] = useState(true);
  const [errorMov, setErrorMov] = useState(false);
  const [modificaciones, setModificaciones] = useState<AuditoriaFila[]>([]);
  const [cargandoMod, setCargandoMod] = useState(false);
  const [errorMod, setErrorMod] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoMov(true);
      const { data, error } = await supabase
        .from('producto_movimientos')
        .select(
          'id, producto_id, tipo, cantidad, cantidad_resultante, motivo, usuario, orden_id, created_at, ordenes ( numero_orden, vendedores ( nombre ), clientes ( nombre, apellido ) )'
        )
        .in('producto_id', productoIds)
        .order('created_at', { ascending: false })
        .limit(limite + 1);
      if (cancelado) return;
      if (error) {
        setErrorMov(true);
      } else {
        const filas = (data as unknown as MovimientoCrudo[]) ?? [];
        // Se pidió uno de más solo para saber si hay más para mostrar.
        setHayMasMovimientos(filas.length > limite);
        setMovimientos(filas.slice(0, limite));
        setErrorMov(false);
      }
      setCargandoMov(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limite]);

  useEffect(() => {
    if (!puedeVerModificaciones) return;
    let cancelado = false;
    (async () => {
      setCargandoMod(true);
      const ids = [...productoIds, ...(maestroId ? [maestroId] : [])];
      const columnas = 'id, actor_nombre, accion, entidad, entidad_id, valor_anterior, valor_nuevo, created_at';
      // Dos consultas: las que quedaron ligadas al producto por su id, y las
      // viejas que no guardaron el id pero sí el nombre entre comillas en el
      // texto de la acción (así no se pierde lo registrado antes).
      const patron = `%"${nombre.replace(/[\\%_]/g, (c) => `\\${c}`)}"%`;
      const [porId, porNombre] = await Promise.all([
        supabase.from('auditoria').select(columnas).in('entidad', ['producto', 'producto_maestro']).in('entidad_id', ids).order('created_at', { ascending: false }).limit(PASO),
        supabase.from('auditoria').select(columnas).in('entidad', ['producto', 'producto_maestro']).is('entidad_id', null).ilike('accion', patron).order('created_at', { ascending: false }).limit(PASO),
      ]);
      if (cancelado) return;
      if (porId.error && porNombre.error) {
        setErrorMod(true);
      } else {
        const unidas = new Map<string, AuditoriaFila>();
        for (const f of [...((porId.data as AuditoriaFila[]) ?? []), ...((porNombre.data as AuditoriaFila[]) ?? [])]) unidas.set(f.id, f);
        setModificaciones(Array.from(unidas.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, PASO));
        setErrorMod(false);
      }
      setCargandoMod(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerModificaciones]);

  const vistas: MovimientoVista[] = useMemo(() => procesarMovimientos(movimientos), [movimientos]);
  const claseTab = (activa: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium ${activa ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'}`;

  return (
    <Modal titulo={`${t('Historial')} — ${nombre}`} onClose={onClose} maxWidth="max-w-lg">
      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Stock actual:')} <span className="font-semibold text-ink dark:text-dark-text">{stockActual}</span>
      </p>

      {puedeVerModificaciones && (
        <div className="flex gap-2">
          <button onClick={() => setPestana('movimientos')} className={claseTab(pestana === 'movimientos')}>
            {t('Movimientos de stock')}
          </button>
          <button onClick={() => setPestana('modificaciones')} className={claseTab(pestana === 'modificaciones')}>
            {t('Modificaciones')}
          </button>
        </div>
      )}

      {pestana === 'movimientos' && (
        <div className="flex flex-col gap-2">
          {cargandoMov && vistas.length === 0 && <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">{t('Cargando...')}</p>}
          {errorMov && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{t('No pudimos cargar los movimientos. Probá de nuevo en un momento.')}</p>}
          {!cargandoMov && !errorMov && vistas.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">{t('Todavía no hay movimientos registrados para este producto.')}</p>
          )}
          {vistas.map((m) => {
            const cantidadTexto = m.cambio != null ? `${m.cambio > 0 ? '+' : '−'}${Math.abs(m.cambio)}` : `±${m.cantidad}`;
            const color = m.cambio == null ? 'text-muted dark:text-dark-text-secondary' : m.cambio > 0 ? 'text-good' : 'text-bad';
            const sucursal = sucursalPorProducto.get(m.producto_id);
            const cliente = m.ordenes?.clientes ? `${m.ordenes.clientes.nombre} ${m.ordenes.clientes.apellido ?? ''}`.trim() : null;
            return (
              <div key={m.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex flex-col gap-1">
                {m.sinRegistro != null && m.sinRegistro !== 0 && m.stockAntes != null && (
                  <p className="text-[11px] text-warn bg-warn/10 rounded-md px-2 py-1">
                    ⚠ {t('Antes de este movimiento el stock cambió sin quedar registrado:')} {m.sinRegistro > 0 ? '+' : '−'}
                    {Math.abs(m.sinRegistro)} {Math.abs(m.sinRegistro) === 1 ? t('unidad') : t('unidades')} ({t('el movimiento anterior dejó')} {m.stockAntes - m.sinRegistro},{' '}
                    {t('este parte de')} {m.stockAntes})
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    <span className={`font-semibold tabular-nums ${color}`}>{cantidadTexto}</span> · {t(ETIQUETA_TIPO_MOVIMIENTO[m.tipo] ?? m.tipo)}
                  </span>
                  <span className="text-xs text-muted dark:text-dark-text-secondary tabular-nums shrink-0">
                    {m.stockAntes != null ? `${m.stockAntes} → ${m.cantidad_resultante}` : `${t('quedó en')} ${m.cantidad_resultante}`}
                  </span>
                </div>
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  {formatearFechaHora(m.created_at, locale)} · {t('Registró:')} <span className="font-medium text-ink dark:text-dark-text">{m.usuario || t('Sin identificar')}</span>
                  {sucursal ? ` · 🏬 ${sucursal}` : ''}
                </p>
                {(m.orden_id || m.ordenes) && (
                  <p className="text-xs">
                    {m.orden_id ? (
                      <Link href={`/ordenes/${m.orden_id}`} className="text-accent dark:text-dark-accent underline">
                        {t('Orden')} {m.ordenes?.numero_orden ?? ''}
                      </Link>
                    ) : (
                      <span>{t('Orden')} {m.ordenes?.numero_orden ?? ''}</span>
                    )}
                    {m.ordenes?.vendedores?.nombre && <span className="text-muted dark:text-dark-text-secondary"> · {t('Vendedor:')} {m.ordenes.vendedores.nombre}</span>}
                    {cliente && <span className="text-muted dark:text-dark-text-secondary"> · {cliente}</span>}
                  </p>
                )}
                {m.motivo && <p className="text-xs text-muted dark:text-dark-text-secondary">{m.motivo}</p>}
              </div>
            );
          })}
          {hayMasMovimientos && (
            <button
              onClick={() => setLimite((l) => l + PASO)}
              disabled={cargandoMov}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-50"
            >
              {cargandoMov ? t('Cargando...') : t('Ver más antiguos')}
            </button>
          )}
        </div>
      )}

      {pestana === 'modificaciones' && puedeVerModificaciones && (
        <div className="flex flex-col gap-2">
          {cargandoMod && <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">{t('Cargando...')}</p>}
          {errorMod && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{t('No pudimos cargar las modificaciones. Probá de nuevo en un momento.')}</p>}
          {!cargandoMod && !errorMod && modificaciones.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">{t('Todavía no hay modificaciones registradas para este producto.')}</p>
          )}
          {modificaciones.map((f) => {
            const cambios = cambiosDeAuditoria(f.valor_anterior, f.valor_nuevo);
            return (
              <div key={f.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex flex-col gap-1">
                <p className="text-sm">
                  <span className="font-medium">{f.actor_nombre}</span> {f.accion}
                </p>
                {cambios.length > 0 && (
                  <ul className="text-xs flex flex-col gap-0.5">
                    {cambios.map((c) => (
                      <li key={c.campo} className="tabular-nums">
                        <span className="text-muted dark:text-dark-text-secondary">{t(c.campo)}:</span> {c.antes} → <span className="font-medium">{c.despues}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted dark:text-dark-text-secondary">{formatearFechaHora(f.created_at, locale)}</p>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
