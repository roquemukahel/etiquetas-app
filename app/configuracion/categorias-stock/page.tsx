'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import {
  obtenerCategorias,
  crearCategoria,
  renombrarCategoria,
  reordenarCategorias,
  activarCategoria,
  archivarCategoria,
  restaurarCategoria,
  contarEnCategoria,
  type Categoria,
  type PerfilCategoria,
  type ModalidadStock,
} from '../../lib/categorias';
import { Boton, BotonIcono } from '../../Boton';
import { ICONOS } from '../../Iconos';

export default function CategoriasStock() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puede = tienePermiso(actor, 'agregar_stock');

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [archivadas, setArchivadas] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const [nombreNueva, setNombreNueva] = useState('');
  const [perfilNueva, setPerfilNueva] = useState<PerfilCategoria>('generico');
  const [modalidadNueva, setModalidadNueva] = useState<ModalidadStock>('cantidad');
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const [activasData, archivadasData] = await Promise.all([obtenerCategorias(supabase, false), obtenerCategorias(supabase, true)]);
    setCategorias(activasData);
    setArchivadas(archivadasData.filter((c) => c.archivada));
    setLoading(false);
  };

  useEffect(() => {
    if (puede) cargar();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const crear = async () => {
    if (!nombreNueva.trim()) return;
    setCreando(true);
    setError(null);
    const resultado = await crearCategoria(supabase, { nombre: nombreNueva, perfilDefault: perfilNueva, modalidadDefault: modalidadNueva, orden: categorias.length });
    setCreando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó la categoría de stock "${nombreNueva.trim()}"`, entidad: 'stock_categoria', entidadId: resultado.id });
    setNombreNueva('');
    await cargar();
  };

  const guardarNombre = async (c: Categoria) => {
    if (!nombreEdit.trim() || nombreEdit.trim() === c.nombre) {
      setEditandoId(null);
      return;
    }
    setProcesando(c.id);
    setError(null);
    const resultado = await renombrarCategoria(supabase, c.id, nombreEdit);
    setProcesando(null);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    await registrarAuditoria(supabase, { accion: `renombró la categoría "${c.nombre}" a "${nombreEdit.trim()}"`, entidad: 'stock_categoria', entidadId: c.id, valorAnterior: { nombre: c.nombre } });
    setEditandoId(null);
    await cargar();
  };

  const mover = async (idx: number, direccion: -1 | 1) => {
    const destino = idx + direccion;
    if (destino < 0 || destino >= categorias.length) return;
    const copia = [...categorias];
    [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
    setCategorias(copia);
    await reordenarCategorias(supabase, copia.map((c) => c.id));
  };

  const toggleActiva = async (c: Categoria) => {
    setProcesando(c.id);
    await activarCategoria(supabase, c.id, !c.activa);
    setProcesando(null);
    await cargar();
  };

  const archivar = async (c: Categoria) => {
    const conteo = await contarEnCategoria(supabase, c.id);
    const detalle = conteo.dispositivos + conteo.productos > 0 ? ` Tiene ${conteo.dispositivos} dispositivo(s) y ${conteo.productos} producto(s) cargados — se conservan intactos, solo deja de ofrecerse para elegir en formularios nuevos.` : '';
    if (!confirm(`¿Archivar la categoría "${c.nombre}"?${detalle}`)) return;
    setProcesando(c.id);
    setError(null);
    const resultado = await archivarCategoria(supabase, c.id);
    setProcesando(null);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    await registrarAuditoria(supabase, { accion: `archivó la categoría de stock "${c.nombre}"`, entidad: 'stock_categoria', entidadId: c.id });
    await cargar();
  };

  const restaurar = async (c: Categoria) => {
    setProcesando(c.id);
    setError(null);
    const resultado = await restaurarCategoria(supabase, c.id, c.nombre);
    setProcesando(null);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    await registrarAuditoria(supabase, { accion: `restauró la categoría de stock "${c.nombre}"`, entidad: 'stock_categoria', entidadId: c.id });
    await cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para gestionar categorías de stock.</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          Volver
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
        <span className="text-lg font-medium">Categorías de stock</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        El stock ya no está limitado a celulares — creá las categorías que necesites (electrodomésticos, artículos del hogar, lo que vendas). "Celulares" y
        "Accesorios" son las que ya tenías, migradas automáticamente sin perder nada.
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Nueva categoría</p>
        <input
          value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)}
          placeholder="Ej. Electrodomésticos"
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Perfil de formulario</label>
            <select value={perfilNueva} onChange={(e) => setPerfilNueva(e.target.value as PerfilCategoria)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
              <option value="generico">Genérico</option>
              <option value="dispositivo">Dispositivo (como celulares)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Control de stock</label>
            <select value={modalidadNueva} onChange={(e) => setModalidadNueva(e.target.value as ModalidadStock)} className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
              <option value="cantidad">Por cantidad</option>
              <option value="serializado">Individual (serializado)</option>
            </select>
          </div>
        </div>
        <Boton variante="primario" tamano="sm" cargando={creando} disabled={!nombreNueva.trim()} onClick={crear} className="self-start">
          + Crear categoría
        </Boton>
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categorias.map((c, idx) => (
            <div key={c.id} className={`rounded-xl border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-2 ${c.activa ? 'border-border dark:border-dark-border' : 'border-border dark:border-dark-border opacity-60'}`}>
              <div className="flex flex-col shrink-0">
                <button onClick={() => mover(idx, -1)} disabled={idx === 0} className="text-muted dark:text-dark-text-secondary disabled:opacity-30 text-xs leading-none py-0.5">
                  ▴
                </button>
                <button onClick={() => mover(idx, 1)} disabled={idx === categorias.length - 1} className="text-muted dark:text-dark-text-secondary disabled:opacity-30 text-xs leading-none py-0.5">
                  ▾
                </button>
              </div>
              <div className="min-w-0 flex-1">
                {editandoId === c.id ? (
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardarNombre(c)}
                    autoFocus
                    className="w-full bg-white dark:bg-dark-surface border border-accent dark:border-dark-accent rounded-lg px-2 py-1 text-sm"
                  />
                ) : (
                  <button onClick={() => { setEditandoId(c.id); setNombreEdit(c.nombre); }} className="text-sm font-medium text-left">
                    {c.nombre}
                  </button>
                )}
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {c.perfil_default === 'dispositivo' ? 'Perfil dispositivo' : 'Perfil genérico'} · {c.modalidad_default === 'serializado' ? 'Individual' : 'Por cantidad'}
                  {!c.activa ? ' · Inactiva' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editandoId === c.id ? (
                  <BotonIcono icono={ICONOS.check} ariaLabel="Guardar nombre" variante="ghost" tamano="sm" disabled={procesando === c.id} onClick={() => guardarNombre(c)} />
                ) : (
                  <BotonIcono icono={ICONOS.editar} ariaLabel="Renombrar" variante="ghost" tamano="sm" onClick={() => { setEditandoId(c.id); setNombreEdit(c.nombre); }} />
                )}
                <label className="flex items-center gap-1 text-[11px] text-muted dark:text-dark-text-secondary px-1 cursor-pointer">
                  <input type="checkbox" checked={c.activa} disabled={procesando === c.id} onChange={() => toggleActiva(c)} className="h-3.5 w-3.5 accent-ink" />
                  Activa
                </label>
                <BotonIcono icono={ICONOS.papelera} ariaLabel={`Archivar ${c.nombre}`} variante="peligro" tamano="sm" disabled={procesando === c.id} onClick={() => archivar(c)} />
              </div>
            </div>
          ))}
          {categorias.length === 0 && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">Todavía no creaste ninguna categoría.</p>}
        </div>
      )}

      {archivadas.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setVerArchivadas((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline self-start">
            {verArchivadas ? 'Ocultar' : 'Ver'} archivadas ({archivadas.length})
          </button>
          {verArchivadas &&
            archivadas.map((c) => (
              <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex items-center justify-between gap-2 opacity-70">
                <p className="text-sm">{c.nombre}</p>
                <Boton variante="secundario" tamano="sm" disabled={procesando === c.id} onClick={() => restaurar(c)}>
                  Restaurar
                </Boton>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
