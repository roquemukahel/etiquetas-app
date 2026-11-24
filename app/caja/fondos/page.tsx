'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { formatearMonto } from '../../lib/numeros';
import { useT, useIdioma } from '../../lib/idioma';
import { localeDe } from '../../lib/i18n/traducir';
import {
  obtenerMovimientosFondos,
  saldosPorCategoria,
  anularMovimientoFondo,
  CATEGORIAS_FONDO,
  ETIQUETA_CATEGORIA_FONDO,
  SIMBOLO_CATEGORIA_FONDO,
  type CategoriaFondo,
  type MovimientoFondo,
} from '../../lib/fondos';
import { QCard } from '../../QCard';
import { Boton } from '../../Boton';
import Modal from '../../Modal';
import ModalMovimientoFondo from './ModalMovimientoFondo';

const EMOJI_CATEGORIA: Record<CategoriaFondo, string> = {
  efectivo_ars: '💵',
  transferencia_ars: '🏦',
  efectivo_usd: '💴',
};

export default function FondosDisponibles() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);
  // Pedido explícito del dueño: SOLO administradores (no "acceso completo") pueden ver y mover esto.
  const puede = tienePermiso(actor, 'gestionar_fondos');

  const [movimientos, setMovimientos] = useState<MovimientoFondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalNuevo, setModalNuevo] = useState<{ categoria: CategoriaFondo; tipo: 'ingreso' | 'egreso' } | null>(null);
  const [modalAnular, setModalAnular] = useState<MovimientoFondo | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      setMovimientos(await obtenerMovimientosFondos(supabase));
    } catch (e) {
      setError(t('No pudimos cargar los fondos:') + ' ' + (e instanceof Error ? e.message : t('error desconocido')));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!puede) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const saldos = useMemo(() => saldosPorCategoria(movimientos), [movimientos]);

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Fondos disponibles.')}</p>
        <Link href="/caja" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Caja')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/caja" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">💰 {t('Fondos disponibles')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Dinero disponible de la empresa en todo momento, aparte de la apertura y el cierre de caja. Solo vos podés registrar ingresos y egresos acá.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CATEGORIAS_FONDO.map((c) => (
              <QCard key={c} firma padding="sm" className="flex flex-col gap-2">
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  {EMOJI_CATEGORIA[c]} {t(ETIQUETA_CATEGORIA_FONDO[c])}
                </p>
                <p className="text-xl font-display font-semibold leading-none tabular-nums">
                  {SIMBOLO_CATEGORIA_FONDO[c]}
                  {formatearMonto(saldos[c])}
                </p>
                <div className="flex gap-1.5 mt-1">
                  <Boton variante="exito" tamano="sm" className="flex-1" onClick={() => setModalNuevo({ categoria: c, tipo: 'ingreso' })}>
                    + {t('Ingreso')}
                  </Boton>
                  <Boton variante="peligro" tamano="sm" className="flex-1" onClick={() => setModalNuevo({ categoria: c, tipo: 'egreso' })}>
                    − {t('Egreso')}
                  </Boton>
                </div>
              </QCard>
            ))}
          </div>

          <p className="text-sm font-medium mt-2">{t('Historial de movimientos')}</p>
          {movimientos.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">{t('Todavía no hay movimientos registrados.')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {movimientos.map((m) => (
                <div key={m.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.descripcion}</p>
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                      {new Date(m.fecha + 'T00:00:00').toLocaleDateString(locale)} · {EMOJI_CATEGORIA[m.categoria]} {t(ETIQUETA_CATEGORIA_FONDO[m.categoria])}
                      {m.registrado_por_nombre && ` · ${m.registrado_por_nombre}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-medium tabular-nums ${m.tipo === 'ingreso' ? 'text-good' : 'text-bad'}`}>
                      {m.tipo === 'ingreso' ? '+' : '−'}
                      {SIMBOLO_CATEGORIA_FONDO[m.categoria]}
                      {formatearMonto(m.importe)}
                    </span>
                    <button onClick={() => setModalAnular(m)} className="text-xs text-bad underline whitespace-nowrap">
                      {t('Anular')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modalNuevo && (
        <ModalMovimientoFondo
          categoriaInicial={modalNuevo.categoria}
          tipoInicial={modalNuevo.tipo}
          onClose={() => setModalNuevo(null)}
          onGuardado={async () => {
            setModalNuevo(null);
            await cargar();
          }}
        />
      )}
      {modalAnular && (
        <ModalAnularFondo
          movimiento={modalAnular}
          onClose={() => setModalAnular(null)}
          onAnulado={async () => {
            setModalAnular(null);
            await cargar();
          }}
        />
      )}
    </main>
  );
}

function ModalAnularFondo({ movimiento, onClose, onAnulado }: { movimiento: MovimientoFondo; onClose: () => void; onAnulado: () => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) {
      setError(t('La anulación necesita un motivo.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await anularMovimientoFondo(supabase, movimiento, motivo);
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onAnulado();
  };

  return (
    <Modal titulo={t('Anular movimiento')} onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          "{movimiento.descripcion}" — {SIMBOLO_CATEGORIA_FONDO[movimiento.categoria]}
          {formatearMonto(movimiento.importe)}. {t('No se puede deshacer.')}
        </p>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Motivo (obligatorio)')}</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="peligro" tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Sí, anular')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
