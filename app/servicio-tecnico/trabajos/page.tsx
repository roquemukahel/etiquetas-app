'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { sanitizarDecimal } from '../../lib/numeros';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';

type Trabajo = { id: string; nombre: string; precio: number | null; imagen_url: string | null };

// Catálogo inicial que se puede cargar con un toque desde "Agregar trabajos
// por defecto" — se insertan sin precio (el dueño lo completa después); las
// fotos viven en /public así no pesan la base de datos.
const TRABAJOS_DEFAULT: { nombre: string; imagen: string }[] = [
  { nombre: 'Cambio de batería', imagen: '/trabajos-default/cambio-bateria.webp' },
  { nombre: 'Cambio de flex de carga', imagen: '/trabajos-default/cambio-flex-carga.webp' },
  { nombre: 'Cambio de cámara trasera', imagen: '/trabajos-default/cambio-camara-trasera.webp' },
  { nombre: 'Cambio de módulo', imagen: '/trabajos-default/cambio-modulo.webp' },
  { nombre: 'Cambio de tapa', imagen: '/trabajos-default/cambio-tapa.webp' },
  { nombre: 'Limpieza de pin de carga', imagen: '/trabajos-default/limpieza-pin-carga.webp' },
];

export default function Trabajos() {
  const supabase = crearClienteNavegador();
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoDefaults, setConfirmandoDefaults] = useState(false);
  const [cargandoDefaults, setCargandoDefaults] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('trabajos').select('*').order('nombre');
    setTrabajos((data as Trabajo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase
      .from('trabajos')
      .insert({ nombre: nombre.trim(), precio: precio ? Number(precio) : null });
    if (insertError) {
      setError('No pudimos guardar: ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setPrecio('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este trabajo del catálogo?')) return;
    const trabajo = trabajos.find((t) => t.id === id);
    await supabase.from('trabajos').delete().eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un trabajo del catálogo (${trabajo?.nombre || 'sin nombre'})`,
      entidad: 'trabajo',
      entidadId: id,
      valorAnterior: trabajo ? { nombre: trabajo.nombre, precio: trabajo.precio } : null,
    });
    cargar();
  };

  const cargarTrabajosDefault = async () => {
    setCargandoDefaults(true);
    setError(null);
    // Si ya se cargaron antes (o el dueño ya tenía un trabajo con ese
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
      .insert(aInsertar.map((t) => ({ nombre: t.nombre, imagen_url: t.imagen })));
    if (insertError) {
      setError('No pudimos cargar los trabajos por defecto: ' + insertError.message);
      setCargandoDefaults(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cargó el catálogo de trabajos por defecto (${aInsertar.length} trabajo${aInsertar.length === 1 ? '' : 's'})`,
      entidad: 'trabajo',
      valorNuevo: { trabajos: aInsertar.map((t) => t.nombre) },
    });
    setConfirmandoDefaults(false);
    setCargandoDefaults(false);
    cargar();
  };

  const cambiarImagen = (t: Trabajo, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setTrabajos((ts) => ts.map((x) => (x.id === t.id ? { ...x, imagen_url: dataUrl } : x)));
      await supabase.from('trabajos').update({ imagen_url: dataUrl }).eq('id', t.id);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Servicios</span>
      </header>

      <ServicioTecnicoTabs active="servicios" />

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Agregar trabajos por defecto</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              Carga un catálogo inicial con imagen: cambio de batería, flex de carga, cámara trasera, módulo, tapa y
              limpieza de pin de carga. Si ya cargaste algunos antes, solo agrega los que todavía te falten.
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
            <p className="text-xs">Una vez que actives esta opción, se cargarán trabajos por defecto. ¿Deseás hacerlo?</p>
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

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Cambio de pantalla)"
            className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
          <input
            value={precio}
            onChange={(e) => setPrecio(sanitizarDecimal(e.target.value))}
            placeholder="Precio"
            inputMode="decimal"
            className="w-24 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="w-full rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Agregar al catálogo
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && trabajos.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no cargaste trabajos.</p>
      )}

      <div className="flex flex-col gap-2">
        {trabajos.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3"
          >
            <label className="shrink-0 cursor-pointer">
              {t.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imagen_url} alt={t.nombre} className="h-11 w-11 rounded-lg object-cover border border-border dark:border-dark-border" />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-lg">
                  📷
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarImagen(t, e)} />
            </label>
            <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
              <p className="text-sm font-medium">{t.nombre}</p>
              <div className="flex items-center gap-3 shrink-0">
                {t.precio != null && <p className="text-sm text-muted dark:text-dark-text-secondary">${t.precio.toLocaleString('es-AR')}</p>}
                <button onClick={() => eliminar(t.id)} className="text-xs text-bad underline">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
