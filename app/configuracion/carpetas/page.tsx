'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { obtenerTodasLasFilas } from '../../lib/db';
import { useT } from '../../lib/idioma';

type Carpeta = { nombre: string; total: number; enStock: number; enModelos: boolean };

export default function CarpetasStock() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'agregar_stock');

  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fusionarDesde, setFusionarDesde] = useState<string | null>(null);
  const [destino, setDestino] = useState('');

  const cargar = async () => {
    const [modelos, dispositivos] = await Promise.all([
      supabase.from('modelos_stock').select('nombre'),
      obtenerTodasLasFilas<{ modelo: string | null; en_stock: boolean }>(supabase, 'dispositivos', 'modelo, en_stock'),
    ]);
    const conteo = new Map<string, { total: number; enStock: number }>();
    for (const d of dispositivos) {
      const nombre = (d.modelo || '').trim();
      if (!nombre) continue;
      const c = conteo.get(nombre) ?? { total: 0, enStock: 0 };
      c.total += 1;
      if (d.en_stock) c.enStock += 1;
      conteo.set(nombre, c);
    }
    const nombresModelos = new Set(((modelos.data as { nombre: string }[]) ?? []).map((m) => m.nombre));
    const todos = new Set<string>([...nombresModelos, ...conteo.keys()]);
    const lista: Carpeta[] = [...todos].map((nombre) => ({
      nombre,
      total: conteo.get(nombre)?.total ?? 0,
      enStock: conteo.get(nombre)?.enStock ?? 0,
      enModelos: nombresModelos.has(nombre),
    }));
    // Primero las que tienen equipos, después alfabético.
    lista.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
    setCarpetas(lista);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otras = useMemo(
    () => carpetas.filter((c) => c.nombre !== fusionarDesde).map((c) => c.nombre),
    [carpetas, fusionarDesde]
  );

  const abrirFusion = (nombre: string) => {
    setFusionarDesde(fusionarDesde === nombre ? null : nombre);
    setDestino('');
    setError(null);
  };

  const fusionar = async (desde: string) => {
    const destinoLimpio = destino.trim();
    if (!destinoLimpio || destinoLimpio === desde) return;
    if (
      !confirm(
        `${t('Vas a mover todos los equipos de la carpeta')} "${desde}" ${t('a')} "${destinoLimpio}" ${t('y borrar la carpeta')} "${desde}". ${t('¿Confirmás?')}`
      )
    )
      return;
    setProcesando(desde);
    setError(null);

    // 1) Reasignar los dispositivos de la carpeta vieja a la nueva.
    const { error: updError } = await supabase.from('dispositivos').update({ modelo: destinoLimpio }).eq('modelo', desde);
    if (updError) {
      setError(t('No pudimos mover los equipos:') + ' ' + updError.message);
      setProcesando(null);
      return;
    }
    // 2) Asegurar que la carpeta destino exista en la lista de carpetas.
    await asegurarModelo(supabase, destinoLimpio);
    // 3) Borrar la carpeta vieja de la lista (los equipos ya no la usan).
    await supabase.from('modelos_stock').delete().eq('nombre', desde);

    await registrarAuditoria(supabase, {
      accion: `unificó la carpeta de stock "${desde}" dentro de "${destinoLimpio}"`,
      entidad: 'stock',
    });

    setProcesando(null);
    setFusionarDesde(null);
    setDestino('');
    cargar();
  };

  const borrarVacia = async (nombre: string) => {
    if (!confirm(`${t('Borrar la carpeta vacía')} "${nombre}"?`)) return;
    setProcesando(nombre);
    setError(null);
    const { error: delError } = await supabase.from('modelos_stock').delete().eq('nombre', nombre);
    if (delError) {
      setError(t('No pudimos borrar la carpeta:') + ' ' + delError.message);
      setProcesando(null);
      return;
    }
    await registrarAuditoria(supabase, { accion: `borró la carpeta de stock vacía "${nombre}"`, entidad: 'stock' });
    setProcesando(null);
    cargar();
  };

  if (!puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar el stock.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Configuración')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Carpetas del stock')}</span>
      </header>

      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('Unificá carpetas repetidas (por ejemplo "13" dentro de "iPhone 13") y borrá las que quedaron vacías. Al unificar, los equipos de una carpeta se mueven a la otra y la carpeta vieja se elimina.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      ) : carpetas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Todavía no hay carpetas de stock.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {carpetas.map((c) => (
            <div key={c.nombre} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.nombre}</p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {c.total} {c.total === 1 ? t('equipo') : t('equipos')} · {c.enStock} {t('en stock')}
                    {!c.enModelos && c.total > 0 ? ` · ${t('carpeta no registrada')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.total === 0 ? (
                    <button
                      disabled={procesando === c.nombre}
                      onClick={() => borrarVacia(c.nombre)}
                      className="text-xs text-bad underline disabled:opacity-40"
                    >
                      {t('Borrar vacía')}
                    </button>
                  ) : (
                    <button
                      disabled={procesando === c.nombre}
                      onClick={() => abrirFusion(c.nombre)}
                      className="text-xs text-accent dark:text-dark-accent underline disabled:opacity-40"
                    >
                      {fusionarDesde === c.nombre ? t('Cancelar') : t('Unificar')}
                    </button>
                  )}
                </div>
              </div>

              {fusionarDesde === c.nombre && (
                <div className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex flex-col gap-2">
                  <label className="text-xs text-muted dark:text-dark-text-secondary">
                    {t('Mover los')} {c.total} {c.total === 1 ? t('equipo') : t('equipos')} {t('de')} «{c.nombre}» {t('a:')}
                  </label>
                  <select
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">{t('Elegí la carpeta destino...')}</option>
                    {otras.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!destino.trim() || procesando === c.nombre}
                    onClick={() => fusionar(c.nombre)}
                    className="rounded-lg bg-accent dark:bg-dark-accent text-white py-2 text-sm font-medium disabled:opacity-40"
                  >
                    {procesando === c.nombre ? t('Unificando...') : `${t('Unificar en')} «${destino || '...'}»`}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
