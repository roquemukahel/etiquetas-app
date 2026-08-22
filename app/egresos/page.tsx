'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { sanitizarDecimal } from '../lib/numeros';
import { MEDIOS_PAGO, medioLabel } from '../lib/cuentaCorriente';
import {
  obtenerEgresos,
  crearEgreso,
  anularEgreso,
  obtenerCategoriasEgresos,
  ETIQUETA_TIPO_EGRESO,
  type Egreso,
  type CategoriaEgreso,
  type TipoEgreso,
} from '../lib/egresos';
import { QCard } from '../QCard';
import { Boton } from '../Boton';
import Modal from '../Modal';
import CampoFecha from '../CampoFecha';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';

type Proveedor = { id: string; nombre: string };

// 'YYYY-MM-DD' a partir de los componentes LOCALES de la fecha — nunca
// toISOString() (convierte a UTC): con la hora avanzada de la noche, eso
// hacía que "hoy" en el formulario apareciera como el día siguiente.
function aFechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function primerDiaMes(d: Date): string {
  return aFechaLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}
function ultimoDiaMes(d: Date): string {
  return aFechaLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export default function Egresos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puede = tienePermiso(actor, 'gestionar_egresos');

  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  // Arranca en la sucursal elegida en el panel — se puede "espiar" otra acá
  // adentro sin tocar la selección global; un useEffect la sigue si el
  // dueño cambia de sucursal MIENTRAS ya está en esta pantalla.
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
  const [categorias, setCategorias] = useState<CategoriaEgreso[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>(['ARS']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState(() => primerDiaMes(new Date()));
  const [hasta, setHasta] = useState(() => ultimoDiaMes(new Date()));

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalAnular, setModalAnular] = useState<Egreso | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [egresosData, categoriasData] = await Promise.all([
        obtenerEgresos(supabase, { desde, hasta }),
        obtenerCategoriasEgresos(supabase),
      ]);
      setEgresos(egresosData);
      setCategorias(categoriasData);
    } catch (e) {
      setError(t('No pudimos cargar los egresos:') + ' ' + (e instanceof Error ? e.message : t('error desconocido')));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!puede) {
      setLoading(false);
      return;
    }
    cargar();
    (async () => {
      const { data: prov } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      setProveedores((prov as Proveedor[]) ?? []);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda, monedas_habilitadas )').eq('id', user.id).single();
      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMonedaCodigo(negocio.moneda);
      if (negocio?.monedas_habilitadas?.length) setMonedasDisponibles(negocio.monedas_habilitadas);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede, desde, hasta]);

  useEffect(() => {
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreCategoria = (id: string | null) => (id ? categorias.find((c) => c.id === id)?.nombre ?? t('Categoría eliminada') : t('Sin categoría'));

  const egresosFiltrados = useMemo(
    () => (filtroSucursal ? egresos.filter((e) => e.sucursal_id === filtroSucursal) : egresos),
    [egresos, filtroSucursal]
  );

  // Total por moneda — nunca se suman monedas distintas.
  const totalesPorMoneda = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const e of egresosFiltrados) mapa.set(e.moneda, (mapa.get(e.moneda) ?? 0) + e.importe);
    return Array.from(mapa.entries());
  }, [egresosFiltrados]);

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Egresos.')}</p>
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
        <span className="text-lg font-medium">{t('Egresos')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Gasto operativo, retiro de dinero o ajuste — no es acá donde se cargan compras de mercadería (Compras) ni pagos a proveedores (Proveedores), esos ya tienen su lugar propio.')}
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
          <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Sin egresos en este rango.')}</p>
        ) : (
          totalesPorMoneda.map(([mon, total]) => (
            <div key={mon}>
              <p className="text-lg font-display font-semibold leading-none">
                {simboloMoneda(mon)}
                {Math.round(total).toLocaleString('es-AR')}
              </p>
              <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Total')} {mon}</p>
            </div>
          ))
        )}
      </QCard>

      <Boton variante="primario" tamano="md" onClick={() => setModalNuevo(true)} className="self-start">
        + {t('Registrar egreso')}
      </Boton>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : egresosFiltrados.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('No hay egresos cargados en este rango.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {egresosFiltrados.map((e) => (
            <div key={e.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{e.descripcion}</p>
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {new Date(e.fecha + 'T00:00:00').toLocaleDateString('es-AR')} · {nombreCategoria(e.categoria_id)} · {t(ETIQUETA_TIPO_EGRESO[e.tipo])}
                  {e.medio_pago ? ` · ${medioLabel(e.medio_pago, t)}` : ''}
                  {e.registrado_por_nombre ? ` · ${e.registrado_por_nombre}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium tabular-nums">
                  {simboloMoneda(e.moneda)}
                  {Math.round(e.importe).toLocaleString('es-AR')}
                </span>
                <button onClick={() => setModalAnular(e)} className="text-xs text-bad underline">
                  {t('Anular')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalNuevo && (
        <ModalNuevoEgreso
          categorias={categorias}
          proveedores={proveedores}
          monedaDefault={monedaCodigo}
          monedasDisponibles={monedasDisponibles}
          onClose={() => setModalNuevo(false)}
          onCreado={async () => {
            setModalNuevo(false);
            await cargar();
          }}
        />
      )}

      {modalAnular && (
        <ModalAnularEgreso
          egreso={modalAnular}
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

function ModalNuevoEgreso({
  categorias,
  proveedores,
  monedaDefault,
  monedasDisponibles,
  onClose,
  onCreado,
}: {
  categorias: CategoriaEgreso[];
  proveedores: Proveedor[];
  monedaDefault: string;
  monedasDisponibles: string[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const [fecha, setFecha] = useState(() => aFechaLocal(new Date()));
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [tipo, setTipo] = useState<TipoEgreso>('gasto_operativo');
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState(monedaDefault);
  const [medioPago, setMedioPago] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    const monto = Number(importe) || 0;
    if (!descripcion.trim()) {
      setError(t('Poné una descripción.'));
      return;
    }
    if (monto <= 0) {
      setError(t('El importe tiene que ser mayor a 0.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await crearEgreso(supabase, {
      fecha,
      categoriaId: categoriaId || null,
      tipo,
      descripcion,
      importe: monto,
      moneda,
      medioPago: medioPago || null,
      proveedorId: proveedorId || null,
      notas,
      sucursalId: sucursalActual.id,
    });
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onCreado();
  };

  return (
    <Modal titulo={t('Registrar egreso')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Descripción')}</label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={t('Ej. Alquiler de agosto')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Fecha')}</label>
            <CampoFecha value={fecha} onChange={setFecha} ancho="completo" />
          </div>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Tipo')}</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEgreso)}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(ETIQUETA_TIPO_EGRESO) as [TipoEgreso, string][]).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Importe')}</label>
            <input
              value={importe}
              onChange={(e) => setImporte(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {monedasDisponibles.length > 1 ? (
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Moneda')}</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                {monedasDisponibles.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Categoría')}</label>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('Sin categoría')}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {monedasDisponibles.length > 1 && (
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Categoría')}</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('Sin categoría')}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Medio de pago (opcional)')}</label>
            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('Sin especificar')}</option>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Proveedor (opcional)')}</label>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('Ninguno')}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Notas (opcional)')}</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Registrar')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

function ModalAnularEgreso({ egreso, onClose, onAnulado }: { egreso: Egreso; onClose: () => void; onAnulado: () => void }) {
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
    const resultado = await anularEgreso(supabase, egreso, motivo);
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onAnulado();
  };

  return (
    <Modal titulo={t('Anular egreso')} onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          "{egreso.descripcion}" — {simboloMoneda(egreso.moneda)}
          {Math.round(egreso.importe).toLocaleString('es-AR')}. {t('No se puede deshacer.')}
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
