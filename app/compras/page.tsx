'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor, useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import { useT } from '../lib/idioma';

type Compra = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  precio: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_stock: 'En stock',
  servicio_tecnico: 'Servicio técnico',
};

export default function Compras() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from('compras')
      .select('id, modelo, capacidad_gb, imei, precio, estado, created_at, clientes ( nombre, apellido )')
      .order('created_at', { ascending: false });
    setCompras((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
  }, []);

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const salirDeSeleccion = () => {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  };

  const eliminarSeleccionados = async () => {
    if (!puedeEliminar) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (!confirm(`${t('¿Eliminar')} ${ids.length} ${ids.length === 1 ? t('compra') : t('compras')}? ${t('No se puede deshacer.')}`)) return;

    setEliminandoSeleccion(true);
    const aEliminar = compras.filter((c) => seleccionados.has(c.id));

    const { error } = await supabase.from('compras').delete().in('id', ids);
    if (!error) {
      // Un solo insert con N filas (no N awaits en fila) — mismo fix que
      // en Stock, misma auditoría de performance (2026-08-26).
      const actorAuditoria = getActor();
      if (actorAuditoria) {
        try {
          await supabase.from('auditoria').insert(
            aEliminar.map((c) => ({
              actor_nombre: actorAuditoria.nombre,
              actor_tipo: actorAuditoria.tipo,
              accion: `eliminó la compra de ${c.modelo || 'sin modelo'}${c.imei ? ` (IMEI ${c.imei})` : ''}`,
              entidad: 'compra',
              entidad_id: c.id,
            }))
          );
        } catch {
          // La auditoría nunca debe romper la acción principal del usuario.
        }
      }
    }

    setEliminandoSeleccion(false);
    salirDeSeleccion();
    cargar();
  };

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return compras;
    return compras.filter((c) =>
      [c.modelo, c.clientes?.nombre, c.clientes?.apellido].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [compras, busqueda]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Compra de dispositivos')}</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('Buscar por modelo o cliente...')}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <Link
        href="/compras/nueva"
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        + {t('Nueva compra')}
      </Link>

      {modoSeleccion ? (
        <div className="sticky top-0 z-10 rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {seleccionados.size} {seleccionados.size === 1 ? t('seleccionado') : t('seleccionados')}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={salirDeSeleccion} className="text-xs text-muted dark:text-dark-text-secondary underline">
              {t('Cancelar')}
            </button>
            <button
              onClick={eliminarSeleccionados}
              disabled={seleccionados.size === 0 || eliminandoSeleccion}
              className="rounded-lg bg-bad text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40"
            >
              {eliminandoSeleccion ? t('Eliminando...') : t('Eliminar')}
            </button>
          </div>
        </div>
      ) : (
        puedeEliminar && (
          <button onClick={() => setModoSeleccion(true)} className="self-start text-xs text-accent dark:text-dark-accent underline">
            {t('Seleccionar varios')}
          </button>
        )
      )}

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
      {!loading && filtradas.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('No hay compras para mostrar.')}</p>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((c) => {
          const seleccionado = seleccionados.has(c.id);
          const clases = `rounded-xl border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3 w-full text-left ${
            seleccionado ? 'ring-2 ring-accent dark:ring-dark-accent border-transparent' : 'border-border dark:border-dark-border'
          }`;
          const contenido = (
            <>
              {modoSeleccion && (
                <span
                  className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    seleccionado
                      ? 'bg-accent dark:bg-dark-accent border-accent dark:border-dark-accent'
                      : 'border-border dark:border-dark-border'
                  }`}
                >
                  {seleccionado && <span className="text-white text-[10px]">✓</span>}
                </span>
              )}
              <MiniaturaDispositivo src={imagenPorNombreExacto(c.modelo, imagenesCarpetas)} />
              <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                <div>
                  <p className="text-sm font-medium">
                    {c.modelo}
                    {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                  </p>
                  {c.imei && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      {t('IMEI:')} <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {c.clientes ? `${c.clientes.nombre} ${c.clientes.apellido || ''}` : t('Sin cliente')}
                  </p>
                </div>
                <div className="text-right">
                  {c.precio != null && <p className="text-sm font-medium">${c.precio.toLocaleString('es-AR')}</p>}
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{t(ETIQUETA_ESTADO[c.estado] || c.estado)}</p>
                </div>
              </div>
            </>
          );

          return modoSeleccion ? (
            <button key={c.id} onClick={() => toggleSeleccion(c.id)} className={clases}>
              {contenido}
            </button>
          ) : (
            <Link key={c.id} href={`/compras/${c.id}`} className={clases}>
              {contenido}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
