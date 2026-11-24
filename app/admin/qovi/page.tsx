'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { StatCard, SeccionCard, EmptyState, Skeleton } from '../_ui';
import { QOVI_ACCIONES } from '../../lib/qovi/acciones';

type Metricas = {
  consultas_totales: number;
  negocios_activos: number;
  costo_total: number;
  tokens_entrada_total: number;
  tokens_salida_total: number;
  valoraciones_utiles: number;
  valoraciones_no_utiles: number;
  consultas_sin_info: number;
  errores: number;
};

type RankingNegocio = { negocio_id: string; nombre_negocio: string; consultas: number; costo: number };

type Negocio = { id: string; nombre: string };
type Configuracion = { negocio_id: string; habilitado: boolean; limite_diario: number | null };

type Articulo = {
  id: string;
  titulo: string;
  slug: string;
  modulo: string;
  contenido: string;
  palabras_clave: string[];
  roles_autorizados: string[];
  ruta_relacionada: string | null;
  acciones_navegacion: string[];
  estado: 'borrador' | 'publicado';
  version: number;
  actualizado_en: string;
};

const MODULOS = [
  'ventas', 'stock', 'clientes', 'servicio_tecnico', 'plan_canje', 'compras', 'proveedores',
  'estadisticas', 'comisiones', 'caja', 'configuracion', 'cuentas_por_cobrar', 'plan_ahorro', 'general',
];
const ROLES = ['administrador', 'vendedor', 'tecnico'];
const CLAVES_ACCION = Object.keys(QOVI_ACCIONES);

function formatUsd(n: number) {
  return `US$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export default function AdminQovi() {
  const supabase = crearClienteNavegador();
  const [vista, setVista] = useState<'metricas' | 'negocios' | 'articulos'>('metricas');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Qovi — asistente inteligente</h1>
      </div>

      <div className="inline-flex items-center gap-1 rounded-xl bg-dark-bg p-1 self-start">
        {([
          ['metricas', 'Métricas'],
          ['negocios', 'Negocios habilitados'],
          ['articulos', 'Base de conocimiento'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === key ? 'bg-dark-surface-elevated text-dark-text' : 'text-dark-text-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === 'metricas' && <VistaMetricas supabase={supabase} />}
      {vista === 'negocios' && <VistaNegocios supabase={supabase} />}
      {vista === 'articulos' && <VistaArticulos supabase={supabase} />}
    </div>
  );
}

function VistaMetricas({ supabase }: { supabase: ReturnType<typeof crearClienteNavegador> }) {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [ranking, setRanking] = useState<RankingNegocio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [m, r] = await Promise.all([supabase.rpc('qovi_admin_metricas'), supabase.rpc('qovi_admin_ranking_negocios')]);
      if (m.error || r.error) {
        setError(m.error?.message || r.error?.message || 'Error desconocido');
        setCargando(false);
        return;
      }
      setMetricas((m.data as Metricas[])?.[0] ?? null);
      setRanking((r.data as RankingNegocio[]) ?? []);
      setCargando(false);
    })();
  }, [supabase]);

  if (cargando) return <Skeleton />;
  if (error) return <EmptyState titulo="No pudimos cargar las métricas" texto={error} />;
  if (!metricas) return <EmptyState titulo="Sin datos todavía" texto="Últimos 30 días, sin consultas registradas." />;

  const totalValoraciones = metricas.valoraciones_utiles + metricas.valoraciones_no_utiles;
  const pctUtil = totalValoraciones > 0 ? Math.round((metricas.valoraciones_utiles / totalValoraciones) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-dark-text-secondary">Últimos 30 días, todos los negocios.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard etiqueta="Consultas totales" valor={String(metricas.consultas_totales)} />
        <StatCard etiqueta="Negocios activos" valor={String(metricas.negocios_activos)} />
        <StatCard etiqueta="Costo total" valor={formatUsd(metricas.costo_total)} />
        <StatCard etiqueta="Tokens de entrada" valor={metricas.tokens_entrada_total.toLocaleString('es-AR')} />
        <StatCard etiqueta="Tokens de salida" valor={metricas.tokens_salida_total.toLocaleString('es-AR')} />
        <StatCard etiqueta="% respuestas útiles" valor={pctUtil != null ? `${pctUtil}%` : '—'} />
        <StatCard etiqueta="Preguntas sin info suficiente" valor={String(metricas.consultas_sin_info)} />
        <StatCard etiqueta="Errores de API" valor={String(metricas.errores)} tono={metricas.errores > 0 ? 'bad' : undefined} />
      </div>

      <SeccionCard titulo="Negocios con mayor consumo">
        {ranking.length === 0 ? (
          <EmptyState titulo="Sin consultas todavía" texto="" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark-text-secondary text-xs">
                <th className="py-1.5">Negocio</th>
                <th className="py-1.5 text-right">Consultas</th>
                <th className="py-1.5 text-right">Costo</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.negocio_id} className="border-t border-dark-border">
                  <td className="py-1.5">{r.nombre_negocio}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.consultas}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatUsd(r.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SeccionCard>
    </div>
  );
}

function VistaNegocios({ supabase }: { supabase: ReturnType<typeof crearClienteNavegador> }) {
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [configs, setConfigs] = useState<Map<string, Configuracion>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    setCargando(true);
    const [n, c] = await Promise.all([supabase.rpc('admin_listar_negocios'), supabase.rpc('admin_qovi_listar_configuraciones')]);
    if (n.error) {
      setError(n.error.message);
      setCargando(false);
      return;
    }
    setNegocios(((n.data as any[]) ?? []).map((x) => ({ id: x.id, nombre: x.nombre })));
    setConfigs(new Map(((c.data as Configuracion[]) ?? []).map((x) => [x.negocio_id, x])));
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (negocioId: string, habilitadoActual: boolean) => {
    setGuardando(negocioId);
    const { error } = await supabase.rpc('admin_qovi_configurar', { p_negocio_id: negocioId, p_habilitado: !habilitadoActual, p_limite_diario: configs.get(negocioId)?.limite_diario ?? null });
    setGuardando(null);
    if (error) {
      setError(error.message);
      return;
    }
    setConfigs((prev) => new Map(prev).set(negocioId, { negocio_id: negocioId, habilitado: !habilitadoActual, limite_diario: configs.get(negocioId)?.limite_diario ?? null }));
  };

  const filtrados = negocios.filter((n) => n.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  if (cargando) return <Skeleton />;

  return (
    <SeccionCard titulo="Habilitar Qovi por negocio (rollout experimental)">
      <p className="text-xs text-dark-text-secondary mb-3">
        Apagado por defecto en todos los negocios. Habilitalo primero en uno o dos negocios de prueba; cuando esté validado, podés activarlo en el resto desde acá.
      </p>
      {error && <p className="text-sm text-bad mb-2">{error}</p>}
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar negocio..."
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm mb-3"
      />
      <div className="flex flex-col gap-1 max-h-[480px] overflow-y-auto">
        {filtrados.map((n) => {
          const habilitado = configs.get(n.id)?.habilitado ?? false;
          return (
            <div key={n.id} className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-dark-bg">
              <span className="text-sm truncate">{n.nombre}</span>
              <button
                onClick={() => toggle(n.id, habilitado)}
                disabled={guardando === n.id}
                className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 disabled:opacity-50 ${
                  habilitado ? 'bg-good/15 text-good' : 'bg-dark-bg text-dark-text-secondary border border-dark-border'
                }`}
              >
                {guardando === n.id ? '...' : habilitado ? 'Habilitado' : 'Deshabilitado'}
              </button>
            </div>
          );
        })}
      </div>
    </SeccionCard>
  );
}

function VistaArticulos({ supabase }: { supabase: ReturnType<typeof crearClienteNavegador> }) {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Articulo | 'nuevo' | null>(null);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase.from('qovi_articulos').select('*').order('actualizado_en', { ascending: false });
    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }
    setArticulos((data as Articulo[]) ?? []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePublicado = async (a: Articulo) => {
    const { error } = await supabase.from('qovi_articulos').update({ estado: a.estado === 'publicado' ? 'borrador' : 'publicado' }).eq('id', a.id);
    if (error) {
      setError(error.message);
      return;
    }
    cargar();
  };

  if (cargando) return <Skeleton />;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-bad">{error}</p>}
      <button onClick={() => setEditando('nuevo')} className="self-start rounded-xl bg-dark-accent text-white px-4 py-2 text-sm font-medium">
        + Nuevo artículo
      </button>

      {articulos.length === 0 ? (
        <EmptyState titulo="Sin artículos todavía" texto="" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {articulos.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-surface px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.titulo}</p>
                <p className="text-[11px] text-dark-text-secondary">
                  {a.modulo} · v{a.version} · {a.roles_autorizados.length ? a.roles_autorizados.join(', ') : 'todos los roles'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${a.estado === 'publicado' ? 'bg-good/15 text-good' : 'bg-dark-bg text-dark-text-secondary'}`}>
                  {a.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                </span>
                <button onClick={() => togglePublicado(a)} className="text-xs text-dark-accent underline">
                  {a.estado === 'publicado' ? 'Despublicar' : 'Publicar'}
                </button>
                <button onClick={() => setEditando(a)} className="text-xs text-dark-accent underline">
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ModalArticulo
          supabase={supabase}
          articulo={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalArticulo({
  supabase,
  articulo,
  onClose,
  onGuardado,
}: {
  supabase: ReturnType<typeof crearClienteNavegador>;
  articulo: Articulo | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [titulo, setTitulo] = useState(articulo?.titulo ?? '');
  const [slug, setSlug] = useState(articulo?.slug ?? '');
  const [modulo, setModulo] = useState(articulo?.modulo ?? 'general');
  const [contenido, setContenido] = useState(articulo?.contenido ?? '');
  const [palabrasClave, setPalabrasClave] = useState(articulo?.palabras_clave?.join(', ') ?? '');
  const [rolesAutorizados, setRolesAutorizados] = useState<string[]>(articulo?.roles_autorizados ?? []);
  const [rutaRelacionada, setRutaRelacionada] = useState(articulo?.ruta_relacionada ?? '');
  const [accionesNavegacion, setAccionesNavegacion] = useState<string[]>(articulo?.acciones_navegacion ?? []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [probandoPrevia, setProbandoPrevia] = useState(false);

  const toggleEnLista = (lista: string[], setLista: (l: string[]) => void, valor: string) => {
    setLista(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  };

  const guardar = async () => {
    if (!titulo.trim() || !slug.trim() || !contenido.trim()) {
      setError('Título, slug y contenido son obligatorios.');
      return;
    }
    setGuardando(true);
    setError(null);
    const payload = {
      titulo: titulo.trim(),
      slug: slug.trim(),
      modulo,
      contenido: contenido.trim(),
      palabras_clave: palabrasClave.split(',').map((p) => p.trim()).filter(Boolean),
      roles_autorizados: rolesAutorizados,
      ruta_relacionada: rutaRelacionada.trim() || null,
      acciones_navegacion: accionesNavegacion,
    };
    const resultado = articulo
      ? await supabase.from('qovi_articulos').update({ ...payload, version: articulo.version + 1 }).eq('id', articulo.id)
      : await supabase.from('qovi_articulos').insert({ ...payload, estado: 'borrador' });
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error.message);
      return;
    }
    onGuardado();
  };

  // Previsualiza cómo respondería Qovi usando ÚNICAMENTE este artículo (sin tocar el endpoint público ni gastar su rate limit).
  const probarPrevia = async () => {
    setProbandoPrevia(true);
    setPrevia(null);
    const { construirInstruccionesEstaticas, construirContextoDinamico } = await import('../../lib/qovi/prompt');
    const sistema = `${construirInstruccionesEstaticas()}\n\n${construirContextoDinamico(
      [{ id: 'previa', titulo, slug: slug || 'previa', modulo, contenido, roles_autorizados: rolesAutorizados, acciones_navegacion: accionesNavegacion, ruta_relacionada: rutaRelacionada || null }],
      (modulo as any) || 'general'
    )}`;
    setPrevia(sistema);
    setProbandoPrevia(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold">{articulo ? 'Editar artículo' : 'Nuevo artículo'}</p>
        {error && <p className="text-sm text-bad">{error}</p>}

        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-dark-text-secondary block mb-1">Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!articulo} className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="text-xs text-dark-text-secondary block mb-1">Módulo</label>
            <select value={modulo} onChange={(e) => setModulo(e.target.value)} className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm">
              {MODULOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Contenido (pasos numerados si corresponde)</label>
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={8} className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Palabras clave (separadas por coma)</label>
          <input value={palabrasClave} onChange={(e) => setPalabrasClave(e.target.value)} className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Roles autorizados (vacío = todos)</label>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => toggleEnLista(rolesAutorizados, setRolesAutorizados, r)}
                className={`text-xs rounded-full px-3 py-1 border ${rolesAutorizados.includes(r) ? 'bg-dark-accent text-white border-dark-accent' : 'border-dark-border text-dark-text-secondary'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Ruta relacionada (opcional, solo informativa)</label>
          <input value={rutaRelacionada} onChange={(e) => setRutaRelacionada(e.target.value)} placeholder="/ordenes/nueva" className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-dark-text-secondary block mb-1">Acciones de navegación permitidas</label>
          <div className="flex flex-wrap gap-2">
            {CLAVES_ACCION.map((c) => (
              <button
                key={c}
                onClick={() => toggleEnLista(accionesNavegacion, setAccionesNavegacion, c)}
                className={`text-[11px] rounded-full px-2.5 py-1 border ${accionesNavegacion.includes(c) ? 'bg-dark-accent text-white border-dark-accent' : 'border-dark-border text-dark-text-secondary'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <button onClick={probarPrevia} disabled={probandoPrevia} className="self-start text-xs text-dark-accent underline">
          {probandoPrevia ? 'Generando...' : 'Previsualizar el prompt que recibiría Claude con este artículo'}
        </button>
        {previa && <pre className="text-[11px] whitespace-pre-wrap bg-dark-bg rounded-lg p-3 max-h-48 overflow-y-auto">{previa}</pre>}

        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-dark-border py-2.5 text-sm font-medium">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} className="flex-1 rounded-xl bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
