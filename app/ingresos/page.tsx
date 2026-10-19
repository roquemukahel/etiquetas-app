'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { formatearMonto } from '../lib/numeros';
import { medioLabel } from '../lib/cuentaCorriente';
import { NOMBRE_CAJA } from '../lib/caja/motor';
import { obtenerIngresos, anularIngreso, ETIQUETA_TIPO_INGRESO, type Ingreso } from '../lib/ingresos';
import { QCard } from '../QCard';
import { Boton } from '../Boton';
import Modal from '../Modal';
import CampoFecha from '../CampoFecha';
import ModalIngreso from './ModalIngreso';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';

function aFechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const primerDiaMes = (d: Date) => aFechaLocal(new Date(d.getFullYear(), d.getMonth(), 1));
const ultimoDiaMes = (d: Date) => aFechaLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));

export default function Ingresos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  // Mismo permiso que ver y gestionar Egresos (administrador / acceso completo): es información sensible de caja.
  const puede = tienePermiso(actor, 'gestionar_egresos');

  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>(['ARS']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => primerDiaMes(new Date()));
  const [hasta, setHasta] = useState(() => ultimoDiaMes(new Date()));
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState<Ingreso | null>(null);
  const [modalAnular, setModalAnular] = useState<Ingreso | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      setIngresos(await obtenerIngresos(supabase, { desde, hasta }));
    } catch (e) {
      setError(t('No pudimos cargar los ingresos:') + ' ' + (e instanceof Error ? e.message : t('error desconocido')));
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
  }, [puede, desde, hasta]);

  useEffect(() => {
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil, error: errorPerfil } = await supabase.from('perfiles').select('negocios ( moneda, monedas_habilitadas )').eq('id', user.id).single();
      if (errorPerfil) return; // sin los datos del negocio quedan la moneda y las opciones por defecto
      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMonedaCodigo(negocio.moneda);
      if (negocio?.monedas_habilitadas?.length) setMonedasDisponibles(negocio.monedas_habilitadas);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => ingresos.filter((i) => !filtroSucursal || i.sucursal_id === filtroSucursal), [ingresos, filtroSucursal]);

  // Total por moneda — nunca se suman monedas distintas.
  const totalesPorMoneda = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of filtrados) mapa.set(i.moneda, (mapa.get(i.moneda) ?? 0) + i.importe);
    return Array.from(mapa.entries());
  }, [filtrados]);

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Ingresos.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
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
        <span className="text-lg font-medium">{t('Ingresos')}</span>
        <Link href="/egresos" className="ml-auto text-xs text-accent dark:text-dark-accent underline">
          {t('Ver Egresos')}
        </Link>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Plata que entra al negocio sin ser una venta: aporte de capital, préstamo recibido u otro ingreso. Si entra en efectivo a una caja, suma al efectivo esperado de su turno.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Desde')}</label>
          <CampoFecha value={desde} onChange={setDesde} ancho="completo" />
        </div>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Hasta')}</label>
          <CampoFecha value={hasta} onChange={setHasta} ancho="completo" />
        </div>
      </div>

      {sucursales.length > 1 && (
        <select
          value={filtroSucursal}
          onChange={(e) => setFiltroSucursal(e.target.value)}
          aria-label={t('Filtrar por sucursal')}
          className="self-start bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">🏬 {t('Todas las sucursales')}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              🏬 {s.nombre}
            </option>
          ))}
        </select>
      )}

      <QCard firma padding="sm" className="flex flex-wrap gap-4">
        {totalesPorMoneda.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Sin ingresos en este rango.')}</p>
        ) : (
          totalesPorMoneda.map(([mon, total]) => (
            <div key={mon}>
              <p className="text-lg font-display font-semibold leading-none text-good">
                {simboloMoneda(mon)}
                {formatearMonto(total)}
              </p>
              <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">
                {t('Total ingresado')} {mon}
              </p>
            </div>
          ))
        )}
      </QCard>

      <Boton variante="primario" tamano="md" onClick={() => setModalNuevo(true)} className="self-start">
        + {t('Registrar ingreso')}
      </Boton>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('No hay ingresos cargados en este rango.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map((i) => (
            <div key={i.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{i.descripcion}</p>
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {new Date(i.fecha + 'T00:00:00').toLocaleDateString('es-AR')} · {t(ETIQUETA_TIPO_INGRESO[i.tipo])} · {medioLabel(i.medio_pago, t)}
                  {i.medio_pago === 'efectivo' ? ` · ${t(NOMBRE_CAJA[i.caja_tipo])}` : ''}
                  {sucursales.length > 1 ? ` · 🏬 ${sucursales.find((s) => s.id === i.sucursal_id)?.nombre ?? t('Sin sucursal')}` : ''}
                  {i.aportado_por ? ` · ${i.aportado_por}` : ''}
                  {i.registrado_por_nombre ? ` · ${i.registrado_por_nombre}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium tabular-nums text-good">
                  +{simboloMoneda(i.moneda)}
                  {formatearMonto(i.importe)}
                </span>
                <button onClick={() => setModalEditar(i)} className="text-xs text-accent dark:text-dark-accent underline">
                  {t('Editar')}
                </button>
                <button onClick={() => setModalAnular(i)} className="text-xs text-bad underline">
                  {t('Anular')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalNuevo && (
        <ModalIngreso
          sucursales={sucursales}
          monedaDefault={monedaCodigo}
          monedasDisponibles={monedasDisponibles}
          onClose={() => setModalNuevo(false)}
          onGuardado={async () => {
            setModalNuevo(false);
            await cargar();
          }}
        />
      )}
      {modalEditar && (
        <ModalIngreso
          ingresoAEditar={modalEditar}
          sucursales={sucursales}
          monedaDefault={monedaCodigo}
          monedasDisponibles={monedasDisponibles}
          onClose={() => setModalEditar(null)}
          onGuardado={async () => {
            setModalEditar(null);
            await cargar();
          }}
        />
      )}
      {modalAnular && (
        <ModalAnular
          ingreso={modalAnular}
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

function ModalAnular({ ingreso, onClose, onAnulado }: { ingreso: Ingreso; onClose: () => void; onAnulado: () => void }) {
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
    const resultado = await anularIngreso(supabase, ingreso, motivo);
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onAnulado();
  };

  return (
    <Modal titulo={t('Anular ingreso')} onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          "{ingreso.descripcion}" — {simboloMoneda(ingreso.moneda)}
          {formatearMonto(ingreso.importe)}. {t('No se puede deshacer.')}
        </p>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Motivo (obligatorio)')}</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
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
