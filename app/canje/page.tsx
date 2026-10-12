'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerTodasLasFilas } from '../lib/db';
import { agregarCanjeAlStock } from '../lib/canje';
import { obtenerImagenesDeCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { infoEstado } from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';
import { ICONOS } from '../Iconos';
import { Boton, BotonIcono } from '../Boton';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';
import { falla, registrarFallo } from '../lib/escritura';

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
  estado: string;
  agregado_a_stock: boolean;
  oculto_en_canje: boolean;
  condicion: string | null;
  ubicacion_fisica: string | null;
  vendedor_id: string | null;
};

type VendedorCanje = { id: string; nombre: string; foto_url: string | null };

// Columnas que se muestran. Antes se traía todo ('*') más la foto del vendedor repetida en CADA fila
// (la foto viaja como data URL y pesa), y de todo el historial: la pantalla se ponía lenta a medida
// que crecían los canjes. Ahora: solo estas columnas, la foto de cada vendedor una sola vez, y cada
// solapa se carga cuando se abre.
const COLUMNAS_CANJE =
  'id, modelo, capacidad_gb, color, imei, salud_bateria, detalles, monto, estado, agregado_a_stock, oculto_en_canje, condicion, ubicacion_fisica, vendedor_id';
const TAMANO_PAGINA_HISTORIAL = 50;

type ReparacionDerivada = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  estado: string;
  fecha_ingreso_servicio: string;
};

type Vista = 'en_canje' | 'derivados' | 'historial';

export default function PlanCanje() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeRecibirServicioTecnico = tienePermiso(actor, 'recibir_servicio_tecnico');
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [derivados, setDerivados] = useState<ReparacionDerivada[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('en_canje');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [editandoUbicacionId, setEditandoUbicacionId] = useState<string | null>(null);
  const [ubicacionInput, setUbicacionInput] = useState('');

  const [vendedores, setVendedores] = useState<Map<string, VendedorCanje>>(new Map());
  const [hayMasHistorial, setHayMasHistorial] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  // Solapas ya cargadas: Derivados e Historial recién se piden la primera vez que se abren.
  const solapasCargadas = useRef<Set<Vista>>(new Set());

  // Trae las miniaturas solo de los modelos que se están mostrando (no las de las 200 carpetas).
  const cargarImagenes = async (modelos: (string | null)[]) => {
    const faltan = modelos.filter((m): m is string => !!m && !imagenesCarpetas.has(m));
    if (faltan.length === 0) return;
    const nuevas = await obtenerImagenesDeCarpetas(supabase, faltan);
    if (nuevas.size > 0) setImagenesCarpetas((prev) => new Map([...prev, ...nuevas]));
  };

  const cargarVista = async (v: Vista) => {
    if (v === 'en_canje') {
      const c = await obtenerTodasLasFilas<Canje>(supabase, 'canjes', COLUMNAS_CANJE, [{ columna: 'created_at', ascending: false }], (q) =>
        q.eq('estado', 'en_canje').eq('agregado_a_stock', false).or('oculto_en_canje.is.null,oculto_en_canje.eq.false')
      );
      setCanjes((prev) => [...c, ...prev.filter((x) => x.agregado_a_stock)]);
      cargarImagenes(c.map((x) => x.modelo));
    } else if (v === 'historial') {
      const { data, error } = await supabase
        .from('canjes')
        .select(COLUMNAS_CANJE)
        .eq('agregado_a_stock', true)
        .order('created_at', { ascending: false })
        .range(0, TAMANO_PAGINA_HISTORIAL - 1);
      if (error) {
        registrarFallo(error, 'cargar el historial de Plan Canje');
        return;
      }
      const h = (data as unknown as Canje[]) ?? [];
      setCanjes((prev) => [...prev.filter((x) => !x.agregado_a_stock), ...h]);
      setHayMasHistorial(h.length === TAMANO_PAGINA_HISTORIAL);
      cargarImagenes(h.map((x) => x.modelo));
    } else {
      const r = await obtenerTodasLasFilas<ReparacionDerivada>(
        supabase,
        'reparaciones',
        'id, numero_orden, modelo, capacidad_gb, color, imei, estado, fecha_ingreso_servicio',
        [{ columna: 'fecha_ingreso_servicio', ascending: false }],
        (q) => q.not('canje_origen_id', 'is', null)
      );
      setDerivados(r);
      cargarImagenes(r.map((x) => x.modelo));
    }
    solapasCargadas.current.add(v);
  };

  const verMasHistorial = async () => {
    setCargandoMas(true);
    const desde = canjes.filter((c) => c.agregado_a_stock).length;
    const { data, error } = await supabase
      .from('canjes')
      .select(COLUMNAS_CANJE)
      .eq('agregado_a_stock', true)
      .order('created_at', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA_HISTORIAL - 1);
    setCargandoMas(false);
    if (error) {
      registrarFallo(error, 'cargar más del historial de Plan Canje');
      return;
    }
    const h = (data as unknown as Canje[]) ?? [];
    setCanjes((prev) => [...prev, ...h]);
    setHayMasHistorial(h.length === TAMANO_PAGINA_HISTORIAL);
    cargarImagenes(h.map((x) => x.modelo));
  };

  // Después de una acción (agregar al stock, derivar, eliminar) se recarga lo que se está viendo y las
  // otras solapas quedan para recargarse cuando se abran (un canje agregado pasa al Historial, etc.).
  const cargar = async () => {
    solapasCargadas.current.clear();
    await cargarVista(vista);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('vendedores').select('id, nombre, foto_url');
      if (error) {
        registrarFallo(error, 'cargar los vendedores de Plan Canje');
        return;
      }
      setVendedores(new Map(((data as VendedorCanje[]) ?? []).map((v) => [v.id, v])));
    })();
  }, []);

  useEffect(() => {
    if (solapasCargadas.current.has(vista)) return;
    setLoading(true);
    cargarVista(vista).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  const filtrados = useMemo(() => {
    if (vista === 'historial') return canjes.filter((c) => c.agregado_a_stock);
    return canjes.filter((c) => c.estado === 'en_canje' && !c.agregado_a_stock && !c.oculto_en_canje);
  }, [canjes, vista]);

  // Ya no cambia el estado del canje: crea una reparación nueva en
  // Servicio Técnico (vinculada por canje_origen_id) y solo oculta el
  // canje de Plan Canje, sin tocarlo — preserva vendedor_id/monto del
  // canje original para las estadísticas de Plan Canje.
  const derivar = async (c: Canje) => {
    if (!puedeRecibirServicioTecnico) return;
    if (!confirm(t('¿Derivar este dispositivo a Servicio Técnico?'))) return;
    setProcesando(c.id);
    const { data: nueva } = await supabase
      .from('reparaciones')
      .insert({
        modelo: c.modelo,
        capacidad_gb: c.capacidad_gb,
        color: c.color,
        imei: c.imei,
        falla_declarada: c.detalles,
        ubicacion_fisica: c.ubicacion_fisica,
        estado: 'recibido',
        canje_origen_id: c.id,
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
      })
      .select('id, numero_orden')
      .single();
    await falla(supabase.from('canjes').update({ oculto_en_canje: true }).eq('id', c.id), t, 'ocultar el canje derivado');
    await registrarAuditoria(supabase, {
      accion: `derivó a Servicio Técnico un dispositivo de Plan Canje (${nueva?.numero_orden || ''}, ${c.modelo || 'sin modelo'}${c.imei ? `, IMEI ${c.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: nueva?.id,
    });
    setProcesando(null);
    cargar();
  };

  const agregarAlStock = async (c: Canje) => {
    if (procesando || !puedeAgregarStock) return;
    if (!getActor()) {
      alert(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (c.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', c.imei).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${c.imei}. ${t('¿Agregarlo igual?')}`)) return;
    }
    if (!confirm(t('¿Agregar este dispositivo al Stock para venderlo?'))) return;
    setProcesando(c.id);

    // La reserva del canje y la creación del dispositivo viven en lib/canje.ts (las comparte
    // el aviso de Stock > Cargar dispositivo).
    const resultado = await agregarCanjeAlStock(supabase, c, { sucursalId: sucursalActual.id, actor: getActor() });
    if (!resultado.ok) {
      if (resultado.yaAgregado) {
        alert(t('Este canje ya había sido agregado al stock (quizás desde otra pestaña).'));
        setProcesando(null);
        cargar();
        return;
      }
      alert(`${t('No pudimos agregar al stock:')} ` + resultado.mensaje);
      setProcesando(null);
      return;
    }
    setProcesando(null);
    cargar();
  };

  const eliminar = async (c: Canje) => {
    if (!puedeEliminar) return;
    if (!confirm(t('¿Eliminar este dispositivo de Plan Canje? Esta acción no se puede deshacer.'))) return;
    setProcesando(c.id);
    if (await falla(supabase.from('canjes').delete().eq('id', c.id), t, 'eliminar canje')) {
      setProcesando(null);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó de Plan Canje un dispositivo (${c.modelo || 'sin modelo'}${c.imei ? `, IMEI ${c.imei}` : ''})`,
      entidad: 'canje',
      entidadId: c.id,
      valorAnterior: { modelo: c.modelo, capacidad_gb: c.capacidad_gb, color: c.color, imei: c.imei, monto: c.monto },
    });
    setProcesando(null);
    cargar();
  };

  const abrirEdicionUbicacion = (c: Canje) => {
    setEditandoUbicacionId(c.id);
    setUbicacionInput(c.ubicacion_fisica || '');
  };

  const guardarUbicacion = async (c: Canje) => {
    setProcesando(c.id);
    if (await falla(supabase.from('canjes').update({ ubicacion_fisica: ubicacionInput.trim() || null }).eq('id', c.id), t, 'guardar ubicación')) {
      setProcesando(null);
      return;
    }
    setEditandoUbicacionId(null);
    setProcesando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Plan Canje')}</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVista('en_canje')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'en_canje' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('En canje')}
        </button>
        <button
          onClick={() => setVista('derivados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'derivados' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Derivados')}
        </button>
        <button
          onClick={() => setVista('historial')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'historial' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Historial')}
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}

      {vista === 'derivados' ? (
        <>
          {!loading && derivados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {t('Todavía no derivaste ningún canje a Servicio Técnico.')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {derivados.map((r) => {
              const est = infoEstado(r.estado);
              return (
                <Link
                  key={r.id}
                  href={`/servicio-tecnico/${r.id}`}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MiniaturaDispositivo src={imagenPorNombreExacto(r.modelo, imagenesCarpetas)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.numero_orden} · {r.modelo}
                        {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
                        {r.color ? ` · ${r.color}` : ''}
                      </p>
                      {r.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono">{r.imei}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${est.color}`}>{t(est.label)}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {!loading && filtrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {vista === 'historial' ? t('Todavía no agregaste ningún canje al stock.') : t('No hay dispositivos para mostrar acá.')}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MiniaturaDispositivo src={imagenPorNombreExacto(c.modelo, imagenesCarpetas)} />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                        {c.modelo}
                        {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                        {c.color ? ` · ${c.color}` : ''}
                        {c.condicion === 'sellado' && (
                          <span className="text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5">
                            ✦ {t('SELLADO')}
                          </span>
                        )}
                      </p>
                      {c.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                        </p>
                      )}
                      {c.salud_bateria != null && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Batería:')} {c.salud_bateria}%</p>}
                    </div>
                  </div>
                  {c.monto != null && <p className="text-sm font-medium">${c.monto.toLocaleString('es-AR')}</p>}
                </div>
                <div className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-0.5">
                  {c.detalles && <p>{t('Detalles:')} {c.detalles}</p>}
                  {c.vendedor_id && vendedores.get(c.vendedor_id)?.nombre && (
                    <p className="flex items-center gap-1.5">
                      {t('Recibido por:')} <Avatar src={vendedores.get(c.vendedor_id)?.foto_url ?? null} nombre={vendedores.get(c.vendedor_id)?.nombre ?? ''} size={34} />{' '}
                      {vendedores.get(c.vendedor_id)?.nombre}
                    </p>
                  )}
                </div>

                {editandoUbicacionId === c.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={ubicacionInput}
                      onChange={(e) => setUbicacionInput(e.target.value)}
                      placeholder={t('Ej. Estante A-3, Tribuna')}
                      className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => guardarUbicacion(c)}
                      disabled={procesando === c.id}
                      className="text-xs font-medium text-accent dark:text-dark-accent shrink-0"
                    >
                      {t('Guardar')}
                    </button>
                    <button onClick={() => setEditandoUbicacionId(null)} className="text-xs text-muted dark:text-dark-text-secondary shrink-0">
                      {t('Cancelar')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirEdicionUbicacion(c)}
                    className="self-start flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text"
                  >
                    <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">
                      {ICONOS.ubicacion}
                    </span>
                    {c.ubicacion_fisica || t('Agregar ubicación')}
                  </button>
                )}

                {vista === 'en_canje' && (
                  <div className="flex items-center gap-2 mt-1">
                    {puedeAgregarStock && (
                      <Boton
                        variante="primario"
                        tamano="sm"
                        cargando={procesando === c.id}
                        onClick={() => agregarAlStock(c)}
                        className="flex-1"
                      >
                        {t('Agregar al Stock')}
                      </Boton>
                    )}
                    {puedeRecibirServicioTecnico && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        disabled={procesando === c.id}
                        onClick={() => derivar(c)}
                        className="flex-1"
                      >
                        {t('Derivar a Servicio Técnico')}
                      </Boton>
                    )}
                    {puedeEliminar && (
                      <BotonIcono
                        variante="peligro"
                        tamano="sm"
                        icono={ICONOS.papelera}
                        ariaLabel={t('Eliminar de Plan Canje')}
                        disabled={procesando === c.id}
                        onClick={() => eliminar(c)}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {vista === 'historial' && hayMasHistorial && (
            <button
              onClick={verMasHistorial}
              disabled={cargandoMas}
              className="self-center rounded-full border border-border dark:border-dark-border px-4 py-2 text-xs font-medium disabled:opacity-50"
            >
              {cargandoMas ? t('Cargando...') : t('Ver más')}
            </button>
          )}
        </>
      )}
    </main>
  );
}
