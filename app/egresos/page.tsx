'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { sanitizarDecimal, formatearMonto } from '../lib/numeros';
import { MEDIOS_PAGO, medioLabel } from '../lib/cuentaCorriente';
import {
  obtenerEgresos,
  crearEgreso,
  editarEgreso,
  anularEgreso,
  obtenerCategoriasEgresos,
  obtenerAreasEgresos,
  ETIQUETA_TIPO_EGRESO,
  type Egreso,
  type CategoriaEgreso,
  type AreaEgreso,
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [filtroArea, setFiltroArea] = useState('');
  const [categorias, setCategorias] = useState<CategoriaEgreso[]>([]);
  const [areas, setAreas] = useState<AreaEgreso[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>(['ARS']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState(() => primerDiaMes(new Date()));
  const [hasta, setHasta] = useState(() => ultimoDiaMes(new Date()));

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState<Egreso | null>(null);
  const [modalAnular, setModalAnular] = useState<Egreso | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [egresosData, categoriasData, areasData] = await Promise.all([
        obtenerEgresos(supabase, { desde, hasta }),
        obtenerCategoriasEgresos(supabase),
        obtenerAreasEgresos(supabase),
      ]);
      setEgresos(egresosData);
      setCategorias(categoriasData);
      setAreas(areasData);
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
    () =>
      egresos
        .filter((e) => !filtroSucursal || e.sucursal_id === filtroSucursal)
        .filter((e) => !filtroArea || e.area_id === filtroArea),
    [egresos, filtroSucursal, filtroArea]
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

      <div className="flex flex-wrap gap-2">
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
        {areas.length > 0 && (
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            aria-label={t('Filtrar por área')}
            className="self-start bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
          >
            <option value="">{t('Todas las áreas')}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <QCard firma padding="sm" className="flex flex-wrap gap-4">
        {totalesPorMoneda.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Sin egresos en este rango.')}</p>
        ) : (
          totalesPorMoneda.map(([mon, total]) => (
            <div key={mon}>
              <p className="text-lg font-display font-semibold leading-none">
                {simboloMoneda(mon)}
                {formatearMonto(total)}
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
                  {sucursales.length > 1 ? ` · 🏬 ${sucursales.find((s) => s.id === e.sucursal_id)?.nombre ?? t('Sin sucursal')}` : ''}
                  {areas.length > 0 && e.area_id ? ` · ${areas.find((a) => a.id === e.area_id)?.nombre ?? ''}` : ''}
                  {e.registrado_por_nombre ? ` · ${e.registrado_por_nombre}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium tabular-nums">
                  {simboloMoneda(e.moneda)}
                  {formatearMonto(e.importe)}
                </span>
                <button onClick={() => setModalEditar(e)} className="text-xs text-accent dark:text-dark-accent underline">
                  {t('Editar')}
                </button>
                <button onClick={() => setModalAnular(e)} className="text-xs text-bad underline">
                  {t('Anular')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalNuevo && (
        <ModalEgreso
          categorias={categorias}
          proveedores={proveedores}
          sucursales={sucursales}
          areas={areas}
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
        <ModalEgreso
          egresoAEditar={modalEditar}
          categorias={categorias}
          proveedores={proveedores}
          sucursales={sucursales}
          areas={areas}
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

function ModalEgreso({
  egresoAEditar,
  categorias,
  proveedores,
  sucursales,
  areas,
  monedaDefault,
  monedasDisponibles,
  onClose,
  onGuardado,
}: {
  egresoAEditar?: Egreso;
  categorias: CategoriaEgreso[];
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  areas: AreaEgreso[];
  monedaDefault: string;
  monedasDisponibles: string[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const [fecha, setFecha] = useState(() => egresoAEditar?.fecha ?? aFechaLocal(new Date()));
  const [categoriaId, setCategoriaId] = useState(egresoAEditar?.categoria_id ?? categorias[0]?.id ?? '');
  const [tipo, setTipo] = useState<TipoEgreso>(egresoAEditar?.tipo ?? 'gasto_operativo');
  const [descripcion, setDescripcion] = useState(egresoAEditar?.descripcion ?? '');
  const [importe, setImporte] = useState(egresoAEditar ? String(egresoAEditar.importe) : '');
  const [moneda, setMoneda] = useState(egresoAEditar?.moneda ?? monedaDefault);
  const [medioPago, setMedioPago] = useState(egresoAEditar?.medio_pago ?? '');
  const [proveedorId, setProveedorId] = useState(egresoAEditar?.proveedor_id ?? '');
  const [sucursalId, setSucursalId] = useState(egresoAEditar?.sucursal_id ?? sucursalActual.id ?? '');
  const [areaId, setAreaId] = useState(egresoAEditar?.area_id ?? '');
  const [notas, setNotas] = useState(egresoAEditar?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [leyendoFoto, setLeyendoFoto] = useState(false);

  // Sacarle una foto a la factura/boleta y completar el formulario solo —
  // pensado sobre todo para compras de repuestos u otros gastos que llegan
  // con comprobante en papel. Best-effort: si no puede leer nada, el
  // formulario queda como estaba, se completa a mano.
  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendoFoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/extract-egreso-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error('fallo la extraccion');
      const { data } = await res.json();
      if (data?.monto) setImporte((prev) => prev || String(data.monto));
      if (data?.moneda) setMoneda((prev) => prev || data.moneda);
      if (data?.fecha) setFecha((prev) => prev || data.fecha);
      if (data?.comercio) {
        setDescripcion((prev) => prev || data.comercio);
        // Si el comercio ya existe como proveedor, lo preseleccionamos —
        // no creamos uno nuevo a ciegas desde una lectura de IA, que podría
        // traer el nombre mal escrito o abreviado.
        const match = proveedores.find((p) => p.nombre.trim().toLowerCase() === data.comercio.trim().toLowerCase());
        if (match) setProveedorId((prev) => prev || match.id);
      } else if (data?.descripcion) {
        setDescripcion((prev) => prev || data.descripcion);
      }
      if (!data?.monto && !data?.comercio && !data?.descripcion) {
        setError(t('No pudimos leer datos de esta foto. Podés completar los campos a mano.'));
      }
    } catch {
      setError(t('No pudimos leer la foto. Podés completar los campos a mano.'));
    } finally {
      setLeyendoFoto(false);
    }
  };

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
    const params = {
      fecha,
      categoriaId: categoriaId || null,
      tipo,
      descripcion,
      importe: monto,
      moneda,
      medioPago: medioPago || null,
      proveedorId: proveedorId || null,
      notas,
      sucursalId: sucursalId || null,
      areaId: areaId || null,
    };
    const resultado = egresoAEditar ? await editarEgreso(supabase, egresoAEditar, params) : await crearEgreso(supabase, params);
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onGuardado();
  };

  return (
    <Modal titulo={egresoAEditar ? t('Editar egreso') : t('Registrar egreso')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('Foto de la factura/boleta (opcional)')}
          </label>
          <input type="file" accept="image/*" onChange={handleFoto} disabled={leyendoFoto} className="text-sm" />
          {leyendoFoto && <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">{t('Leyendo la foto...')}</p>}
        </div>

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
        {(sucursales.length > 1 || areas.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {sucursales.length > 1 && (
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Sucursal')}</label>
                <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                  <option value="">{t('Sin especificar')}</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏬 {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {areas.length > 0 && (
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Área')}</label>
                <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                  <option value="">{t('Sin especificar')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
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
            {egresoAEditar ? t('Guardar cambios') : t('Registrar')}
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
          {formatearMonto(egreso.importe)}. {t('No se puede deshacer.')}
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
