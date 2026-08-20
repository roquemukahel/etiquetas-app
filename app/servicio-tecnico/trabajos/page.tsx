'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { sanitizarDecimal } from '../../lib/numeros';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';
import Modal from '../../Modal';
import { ICONOS } from '../../Iconos';

function IconoChico({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0 ${className}`}>
      {ICONOS[nombre]}
    </span>
  );
}

type Trabajo = {
  id: string;
  nombre: string;
  precio: number | null;
  imagen_url: string | null;
  categoria: string | null;
  descripcion_interna: string | null;
  duracion_estimada_min: number | null;
  garantia_dias: number | null;
  compatibilidad: string | null;
  repuesto_sugerido_id: string | null;
  checklist_tecnico: string[] | null;
  instrucciones_internas: string | null;
  activo: boolean;
  orden_visualizacion: number;
};

type RepuestoOpcion = { id: string; nombre: string };

// Mismas 12 categorías sugeridas del rediseño — texto libre en la base (sin
// CHECK constraint), esto es solo la lista que ofrece el selector, igual
// criterio que ESTADOS_REPARACION en lib/reparaciones.ts.
const CATEGORIAS = [
  'Pantalla y táctil',
  'Batería y energía',
  'Cámaras',
  'Carga y conectividad',
  'Audio',
  'Botones',
  'Chasis y tapa',
  'Placa y microsoldadura',
  'Software',
  'Limpieza y mantenimiento',
  'Diagnóstico',
  'Otros',
];

// Catálogo inicial que se puede cargar con un toque desde "Agregar servicios
// por defecto" — se insertan sin precio (el dueño lo completa después); las
// fotos viven en /public así no pesan la base de datos.
const TRABAJOS_DEFAULT: { nombre: string; imagen: string; categoria: string }[] = [
  { nombre: 'Cambio de batería', imagen: '/trabajos-default/cambio-bateria.webp', categoria: 'Batería y energía' },
  { nombre: 'Cambio de flex de carga', imagen: '/trabajos-default/cambio-flex-carga.webp', categoria: 'Carga y conectividad' },
  { nombre: 'Cambio de cámara trasera', imagen: '/trabajos-default/cambio-camara-trasera.webp', categoria: 'Cámaras' },
  { nombre: 'Cambio de módulo', imagen: '/trabajos-default/cambio-modulo.webp', categoria: 'Pantalla y táctil' },
  { nombre: 'Cambio de tapa', imagen: '/trabajos-default/cambio-tapa.webp', categoria: 'Chasis y tapa' },
  { nombre: 'Limpieza de pin de carga', imagen: '/trabajos-default/limpieza-pin-carga.webp', categoria: 'Limpieza y mantenimiento' },
];

type FormState = {
  nombre: string;
  precio: string;
  categoria: string;
  descripcion_interna: string;
  duracion_estimada_min: string;
  garantia_dias: string;
  compatibilidad: string;
  repuesto_sugerido_id: string;
  checklist_tecnico: string;
  instrucciones_internas: string;
  imagen_url: string | null;
};

const FORM_VACIO: FormState = {
  nombre: '',
  precio: '',
  categoria: '',
  descripcion_interna: '',
  duracion_estimada_min: '',
  garantia_dias: '',
  compatibilidad: '',
  repuesto_sugerido_id: '',
  checklist_tecnico: '',
  instrucciones_internas: '',
  imagen_url: null,
};

export default function Servicios() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_servicio_tecnico');
  // "Eliminar definitivamente" usa el mismo permiso más estricto que ya
  // protege el borrado duro de reparaciones (distinto de "gestionar" —
  // alguien puede tener permiso para administrar el catálogo sin tener
  // permiso para borrar en bloque).
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [repuestos, setRepuestos] = useState<RepuestoOpcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [verArchivados, setVerArchivados] = useState(false);
  const [confirmandoDefaults, setConfirmandoDefaults] = useState(false);
  const [cargandoDefaults, setCargandoDefaults] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('trabajos').select('*').order('orden_visualizacion').order('nombre');
    setTrabajos((data as Trabajo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('repuestos').select('id, nombre').order('nombre');
      setRepuestos((data as RepuestoOpcion[]) ?? []);
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return trabajos.filter((t) => {
      if (verArchivados ? t.activo : !t.activo) return false;
      if (filtroCategoria && t.categoria !== filtroCategoria) return false;
      if (q && !t.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trabajos, busqueda, filtroCategoria, verArchivados]);

  const categoriasUsadas = useMemo(() => {
    const usadas = new Set(trabajos.map((t) => t.categoria).filter(Boolean) as string[]);
    return CATEGORIAS.filter((c) => usadas.has(c));
  }, [trabajos]);

  const nombreRepuesto = (id: string | null) => (id ? repuestos.find((r) => r.id === id)?.nombre : undefined);

  const abrirNuevo = () => {
    if (!puedeGestionar) return;
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (t: Trabajo) => {
    if (!puedeGestionar) return;
    setEditandoId(t.id);
    setForm({
      nombre: t.nombre,
      precio: t.precio != null ? String(t.precio) : '',
      categoria: t.categoria ?? '',
      descripcion_interna: t.descripcion_interna ?? '',
      duracion_estimada_min: t.duracion_estimada_min != null ? String(t.duracion_estimada_min) : '',
      garantia_dias: t.garantia_dias != null ? String(t.garantia_dias) : '',
      compatibilidad: t.compatibilidad ?? '',
      repuesto_sugerido_id: t.repuesto_sugerido_id ?? '',
      checklist_tecnico: (t.checklist_tecnico ?? []).join('\n'),
      instrucciones_internas: t.instrucciones_internas ?? '',
      imagen_url: t.imagen_url,
    });
    setError(null);
    setMenuAbierto(null);
    setModalAbierto(true);
  };

  const cambiarImagenForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imagen_url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !puedeGestionar) return;
    setGuardando(true);
    setError(null);
    const payload = {
      nombre: form.nombre.trim(),
      precio: form.precio ? Number(form.precio) : null,
      categoria: form.categoria || null,
      descripcion_interna: form.descripcion_interna.trim() || null,
      duracion_estimada_min: form.duracion_estimada_min ? Number(form.duracion_estimada_min) : null,
      garantia_dias: form.garantia_dias ? Number(form.garantia_dias) : null,
      compatibilidad: form.compatibilidad.trim() || null,
      repuesto_sugerido_id: form.repuesto_sugerido_id || null,
      checklist_tecnico: form.checklist_tecnico.trim()
        ? form.checklist_tecnico
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        : null,
      instrucciones_internas: form.instrucciones_internas.trim() || null,
      imagen_url: form.imagen_url,
    };

    if (editandoId) {
      const { error: updError } = await supabase.from('trabajos').update(payload).eq('id', editandoId);
      if (updError) {
        setError('No pudimos guardar: ' + updError.message);
        setGuardando(false);
        return;
      }
      await registrarAuditoria(supabase, {
        accion: `editó el servicio "${payload.nombre}" del catálogo`,
        entidad: 'trabajo',
        entidadId: editandoId,
      });
    } else {
      const { data: nuevo, error: insError } = await supabase.from('trabajos').insert(payload).select('id').single();
      if (insError) {
        setError('No pudimos guardar: ' + insError.message);
        setGuardando(false);
        return;
      }
      await registrarAuditoria(supabase, {
        accion: `agregó "${payload.nombre}" al catálogo de servicios`,
        entidad: 'trabajo',
        entidadId: nuevo?.id,
      });
    }
    setGuardando(false);
    setModalAbierto(false);
    cargar();
  };

  const duplicar = async (t: Trabajo) => {
    if (!puedeGestionar) return;
    setMenuAbierto(null);
    const { data: nuevo, error: insError } = await supabase
      .from('trabajos')
      .insert({
        nombre: `${t.nombre} (copia)`,
        precio: t.precio,
        imagen_url: t.imagen_url,
        categoria: t.categoria,
        descripcion_interna: t.descripcion_interna,
        duracion_estimada_min: t.duracion_estimada_min,
        garantia_dias: t.garantia_dias,
        compatibilidad: t.compatibilidad,
        repuesto_sugerido_id: t.repuesto_sugerido_id,
        checklist_tecnico: t.checklist_tecnico,
        instrucciones_internas: t.instrucciones_internas,
      })
      .select('id')
      .single();
    if (insError) return;
    await registrarAuditoria(supabase, {
      accion: `duplicó el servicio "${t.nombre}" del catálogo`,
      entidad: 'trabajo',
      entidadId: nuevo?.id,
    });
    cargar();
  };

  // "Archivar" en vez de eliminar es la vía normal para retirar un servicio
  // del catálogo: nunca borra nada que ya se haya usado en una reparación.
  const archivar = async (t: Trabajo, activo: boolean) => {
    if (!puedeGestionar) return;
    setMenuAbierto(null);
    await supabase.from('trabajos').update({ activo }).eq('id', t.id);
    await registrarAuditoria(supabase, {
      accion: `${activo ? 'reactivó' : 'archivó'} el servicio "${t.nombre}" del catálogo`,
      entidad: 'trabajo',
      entidadId: t.id,
    });
    setTrabajos((ts) => ts.map((x) => (x.id === t.id ? { ...x, activo } : x)));
  };

  const eliminar = async (t: Trabajo) => {
    if (!puedeEliminar) return;
    setMenuAbierto(null);
    if (
      !confirm(
        `¿Eliminar definitivamente "${t.nombre}"? Esto no se puede deshacer. Si ya se usó en alguna reparación, mejor archivalo en vez de eliminarlo.`
      )
    )
      return;
    await supabase.from('trabajos').delete().eq('id', t.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó definitivamente el servicio "${t.nombre}" del catálogo`,
      entidad: 'trabajo',
      entidadId: t.id,
      valorAnterior: { nombre: t.nombre, precio: t.precio, categoria: t.categoria },
    });
    cargar();
  };

  const cargarTrabajosDefault = async () => {
    if (!puedeGestionar) return;
    setCargandoDefaults(true);
    setError(null);
    // Si ya se cargaron antes (o el dueño ya tenía un servicio con ese
    // nombre), no los duplicamos.
    const nombresExistentes = new Set(trabajos.map((t) => t.nombre.trim().toLowerCase()));
    const aInsertar = TRABAJOS_DEFAULT.filter((t) => !nombresExistentes.has(t.nombre.toLowerCase()));
    if (aInsertar.length === 0) {
      setConfirmandoDefaults(false);
      setCargandoDefaults(false);
      return;
    }
    const { error: insertError } = await supabase
      .from('trabajos')
      .insert(aInsertar.map((t) => ({ nombre: t.nombre, imagen_url: t.imagen, categoria: t.categoria })));
    if (insertError) {
      setError('No pudimos cargar los servicios por defecto: ' + insertError.message);
      setCargandoDefaults(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cargó el catálogo de servicios por defecto (${aInsertar.length} servicio${aInsertar.length === 1 ? '' : 's'})`,
      entidad: 'trabajo',
      valorNuevo: { trabajos: aInsertar.map((t) => t.nombre) },
    });
    setConfirmandoDefaults(false);
    setCargandoDefaults(false);
    cargar();
  };

  const hayFiltrosActivos = busqueda.trim() !== '' || filtroCategoria !== '' || verArchivados;
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroCategoria('');
    setVerArchivados(false);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/servicio-tecnico" aria-label="Volver" className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-medium leading-tight">Servicios</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            Catálogo de arreglos: precio, duración, garantía y repuesto sugerido
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={abrirNuevo}
            className="shrink-0 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2.5 text-sm font-medium text-white"
          >
            + Nuevo servicio
          </button>
        )}
      </header>

      <ServicioTecnicoTabs active="servicios" />

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeGestionar && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          No tenés permiso para gestionar Servicio Técnico — solo podés ver el catálogo.
        </p>
      )}

      {trabajos.length === 0 && !loading && puedeGestionar && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Agregar servicios por defecto</p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                Carga un catálogo inicial con imagen: cambio de batería, flex de carga, cámara trasera, módulo, tapa y
                limpieza de pin de carga.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={confirmandoDefaults}
              onClick={() => setConfirmandoDefaults((v) => !v)}
              className={`shrink-0 relative h-7 w-12 rounded-full transition-colors ${
                confirmandoDefaults ? 'bg-accent dark:bg-dark-accent' : 'bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  confirmandoDefaults ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {confirmandoDefaults && (
            <div className="rounded-lg border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-3 py-2.5 flex flex-col gap-2">
              <p className="text-xs">Una vez que actives esta opción, se cargarán servicios por defecto. ¿Deseás hacerlo?</p>
              <div className="flex gap-2">
                <button
                  disabled={cargandoDefaults}
                  onClick={cargarTrabajosDefault}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  {cargandoDefaults ? 'Cargando…' : 'Sí, cargar'}
                </button>
                <button
                  disabled={cargandoDefaults}
                  onClick={() => setConfirmandoDefaults(false)}
                  className="rounded-lg border border-border dark:border-dark-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {trabajos.length > 0 && (
        <div className="flex flex-col gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar servicio..."
            aria-label="Buscar servicio"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-2.5 text-sm"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              aria-label="Filtrar por categoría"
              className="flex-1 min-w-[140px] bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas las categorías</option>
              {categoriasUsadas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => setVerArchivados((v) => !v)}
              aria-pressed={verArchivados}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium border ${
                verArchivados
                  ? 'bg-accent dark:bg-dark-accent text-white border-accent dark:border-dark-accent'
                  : 'border-border dark:border-dark-border'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <IconoChico nombre="stock" /> {verArchivados ? 'Viendo archivados' : 'Ver archivados'}
              </span>
            </button>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium border border-border dark:border-dark-border"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && trabajos.length > 0 && filtrados.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-center py-8">
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {verArchivados ? 'No hay servicios archivados.' : 'No hay servicios en este filtro.'}
          </p>
          {hayFiltrosActivos && (
            <button onClick={limpiarFiltros} className="text-xs text-accent dark:text-dark-accent underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtrados.map((t) => (
          <div
            key={t.id}
            className="group relative rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card flex flex-col transition-all duration-200 ease-out hover:-translate-y-1 hover:rotate-[0.5deg] hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:transform-none"
          >
            <div className="h-28 rounded-t-2xl bg-canvas dark:bg-dark-bg flex items-center justify-center overflow-hidden shrink-0">
              {t.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imagen_url} alt={t.nombre} className="h-full w-full object-contain p-3" loading="lazy" />
              ) : (
                <span aria-hidden="true" className="[&_svg]:h-8 [&_svg]:w-8 text-muted dark:text-dark-text-secondary">
                  {ICONOS.herramienta}
                </span>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1.5 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{t.nombre}</p>
                {(puedeGestionar || puedeEliminar) && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenuAbierto(menuAbierto === t.id ? null : t.id)}
                    aria-label="Más acciones"
                    className="text-lg leading-none px-1 text-muted dark:text-dark-text-secondary"
                  >
                    ⋯
                  </button>
                  {menuAbierto === t.id && (
                    <div className="absolute right-0 top-6 z-10 w-44 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated flex flex-col overflow-hidden">
                      {puedeGestionar && (
                      <button onClick={() => abrirEdicion(t)} className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg">
                        <IconoChico nombre="editar" /> Editar
                      </button>
                      )}
                      {puedeGestionar && (
                      <button onClick={() => duplicar(t)} className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg">
                        <IconoChico nombre="duplicar" /> Duplicar
                      </button>
                      )}
                      {puedeGestionar && (
                      <button onClick={() => archivar(t, !t.activo)} className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg">
                        <IconoChico nombre={t.activo ? 'stock' : 'deshacer'} /> {t.activo ? 'Archivar' : 'Reactivar'}
                      </button>
                      )}
                      {puedeEliminar && (
                      <button onClick={() => eliminar(t)} className="px-3 py-2 text-xs text-left text-bad hover:bg-bad/10">
                        Eliminar definitivamente
                      </button>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>

              {t.categoria && (
                <span className="self-start rounded-full bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent text-[11px] font-medium px-2 py-0.5">
                  {t.categoria}
                </span>
              )}

              <div className="flex items-center gap-2 flex-wrap text-xs text-muted dark:text-dark-text-secondary mt-0.5">
                {t.precio != null && <span className="text-ink dark:text-dark-text font-medium">${t.precio.toLocaleString('es-AR')}</span>}
                {t.duracion_estimada_min != null && (
                  <span className="flex items-center gap-1">
                    <IconoChico nombre="reloj" /> {t.duracion_estimada_min} min
                  </span>
                )}
                {t.garantia_dias != null && (
                  <span className="flex items-center gap-1">
                    <IconoChico nombre="escudo" /> {t.garantia_dias}d garantía
                  </span>
                )}
              </div>

              {t.compatibilidad && (
                <p className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary truncate">
                  <IconoChico nombre="telefono" /> {t.compatibilidad}
                </p>
              )}
              {nombreRepuesto(t.repuesto_sugerido_id) && (
                <p className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary truncate">
                  <IconoChico nombre="repuesto" /> {nombreRepuesto(t.repuesto_sugerido_id)}
                </p>
              )}

              {!t.activo && (
                <span className="self-start rounded-full bg-muted/15 text-muted dark:text-dark-text-secondary text-[11px] font-medium px-2 py-0.5 mt-auto">
                  Archivado
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAbierto && (
        <Modal titulo={editandoId ? 'Editar servicio' : 'Nuevo servicio'} onClose={() => setModalAbierto(false)} maxWidth="max-w-lg">
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col gap-3">
            <label className="self-start cursor-pointer">
              {form.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imagen_url}
                  alt=""
                  className="h-20 w-20 rounded-lg object-contain bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-1"
                />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-canvas dark:bg-dark-bg border border-dashed border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-6 [&_svg]:w-6">
                  {ICONOS.camara}
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={cambiarImagenForm} />
            </label>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Nombre *</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Cambio de pantalla"
                autoFocus
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Precio base</label>
                <input
                  value={form.precio}
                  onChange={(e) => setForm((f) => ({ ...f, precio: sanitizarDecimal(e.target.value) }))}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Categoría</label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Sin categoría</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Duración estimada (min)</label>
                <input
                  value={form.duracion_estimada_min}
                  onChange={(e) => setForm((f) => ({ ...f, duracion_estimada_min: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  placeholder="Ej. 60"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Garantía (días)</label>
                <input
                  value={form.garantia_dias}
                  onChange={(e) => setForm((f) => ({ ...f, garantia_dias: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  placeholder="Ej. 90"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Dispositivos compatibles</label>
              <input
                value={form.compatibilidad}
                onChange={(e) => setForm((f) => ({ ...f, compatibilidad: e.target.value }))}
                placeholder="Ej. iPhone 11, 11 Pro, 11 Pro Max"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Repuesto sugerido</label>
              <select
                value={form.repuesto_sugerido_id}
                onChange={(e) => setForm((f) => ({ ...f, repuesto_sugerido_id: e.target.value }))}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Ninguno</option>
                {repuestos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Checklist técnico (uno por línea)</label>
              <textarea
                value={form.checklist_tecnico}
                onChange={(e) => setForm((f) => ({ ...f, checklist_tecnico: e.target.value }))}
                rows={3}
                placeholder={'Ej.\nVerificar Face ID\nProbar carga inalámbrica'}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Descripción interna (opcional)</label>
              <textarea
                value={form.descripcion_interna}
                onChange={(e) => setForm((f) => ({ ...f, descripcion_interna: e.target.value }))}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Instrucciones internas (opcional)</label>
              <textarea
                value={form.instrucciones_internas}
                onChange={(e) => setForm((f) => ({ ...f, instrucciones_internas: e.target.value }))}
                rows={2}
                placeholder="Solo la ve el equipo, nunca el cliente"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setModalAbierto(false)}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              disabled={!form.nombre.trim() || guardando}
              onClick={guardar}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
