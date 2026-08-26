'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import {
  obtenerAreasEgresos,
  crearAreaEgreso,
  renombrarAreaEgreso,
  reordenarAreasEgresos,
  archivarAreaEgreso,
  restaurarAreaEgreso,
  contarEnAreaEgreso,
  type AreaEgreso,
} from '../../lib/egresos';
import { Boton, BotonIcono } from '../../Boton';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

export default function AreasEgresos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_egresos');

  const [areas, setAreas] = useState<AreaEgreso[]>([]);
  const [archivadas, setArchivadas] = useState<AreaEgreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const [nombreNueva, setNombreNueva] = useState('');
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const [activasData, todasData] = await Promise.all([obtenerAreasEgresos(supabase, false), obtenerAreasEgresos(supabase, true)]);
    setAreas(activasData);
    setArchivadas(todasData.filter((a) => a.archivada));
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
    const resultado = await crearAreaEgreso(supabase, nombreNueva, areas.length);
    setCreando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó el área de egresos "${nombreNueva.trim()}"`, entidad: 'egreso_area', entidadId: resultado.id });
    setNombreNueva('');
    await cargar();
  };

  const guardarNombre = async (a: AreaEgreso) => {
    if (!nombreEdit.trim() || nombreEdit.trim() === a.nombre) {
      setEditandoId(null);
      return;
    }
    setProcesando(a.id);
    setError(null);
    const resultado = await renombrarAreaEgreso(supabase, a.id, nombreEdit);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `renombró el área de egresos "${a.nombre}" a "${nombreEdit.trim()}"`, entidad: 'egreso_area', entidadId: a.id, valorAnterior: { nombre: a.nombre } });
    setEditandoId(null);
    await cargar();
  };

  const mover = async (idx: number, direccion: -1 | 1) => {
    const destino = idx + direccion;
    if (destino < 0 || destino >= areas.length) return;
    const copia = [...areas];
    [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
    setAreas(copia);
    await reordenarAreasEgresos(supabase, copia.map((a) => a.id));
  };

  const archivar = async (a: AreaEgreso) => {
    const conteo = await contarEnAreaEgreso(supabase, a.id);
    const detalle = conteo > 0 ? ` ${t('Tiene')} ${conteo} ${t('egreso(s) cargados — se conservan intactos, solo deja de ofrecerse para elegir en formularios nuevos.')}` : '';
    if (!confirm(`${t('¿Archivar el área')} "${a.nombre}"?${detalle}`)) return;
    setProcesando(a.id);
    setError(null);
    const resultado = await archivarAreaEgreso(supabase, a.id);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `archivó el área de egresos "${a.nombre}"`, entidad: 'egreso_area', entidadId: a.id });
    await cargar();
  };

  const restaurar = async (a: AreaEgreso) => {
    setProcesando(a.id);
    setError(null);
    const resultado = await restaurarAreaEgreso(supabase, a.id, a.nombre);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `restauró el área de egresos "${a.nombre}"`, entidad: 'egreso_area', entidadId: a.id });
    await cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar áreas de egresos.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
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
        <span className="text-lg font-medium">{t('Áreas de egresos')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Un área es un lugar físico dentro de una sucursal (por ejemplo Local o Taller) que querés distinguir al registrar un gasto — se combina con la sucursal, no la reemplaza. Te dejamos "Local" y "Taller" cargados para arrancar; renombralos, agregá los que te sirvan, o archivá los que no uses.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
        <p className="text-sm font-medium">{t('Nueva área')}</p>
        <div className="flex gap-2">
          <input
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && crear()}
            placeholder={t('Ej. Depósito')}
            className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <Boton variante="primario" tamano="sm" cargando={creando} disabled={!nombreNueva.trim()} onClick={crear}>
            + {t('Crear')}
          </Boton>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">{t('Cargando...')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {areas.map((a, idx) => (
            <div key={a.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-2">
              <div className="flex flex-col shrink-0">
                <button onClick={() => mover(idx, -1)} disabled={idx === 0} className="text-muted dark:text-dark-text-secondary disabled:opacity-30 text-xs leading-none py-0.5">
                  ▴
                </button>
                <button onClick={() => mover(idx, 1)} disabled={idx === areas.length - 1} className="text-muted dark:text-dark-text-secondary disabled:opacity-30 text-xs leading-none py-0.5">
                  ▾
                </button>
              </div>
              <div className="min-w-0 flex-1">
                {editandoId === a.id ? (
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardarNombre(a)}
                    autoFocus
                    className="w-full bg-white dark:bg-dark-surface border border-accent dark:border-dark-accent rounded-lg px-2 py-1 text-sm"
                  />
                ) : (
                  <button onClick={() => { setEditandoId(a.id); setNombreEdit(a.nombre); }} className="text-sm font-medium text-left">
                    {a.nombre}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editandoId === a.id ? (
                  <BotonIcono icono={ICONOS.check} ariaLabel={t('Guardar nombre')} variante="ghost" tamano="sm" disabled={procesando === a.id} onClick={() => guardarNombre(a)} />
                ) : (
                  <BotonIcono icono={ICONOS.editar} ariaLabel={t('Renombrar')} variante="ghost" tamano="sm" onClick={() => { setEditandoId(a.id); setNombreEdit(a.nombre); }} />
                )}
                <BotonIcono icono={ICONOS.papelera} ariaLabel={`${t('Archivar')} ${a.nombre}`} variante="peligro" tamano="sm" disabled={procesando === a.id} onClick={() => archivar(a)} />
              </div>
            </div>
          ))}
          {areas.length === 0 && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">{t('Todavía no creaste ninguna área.')}</p>}
        </div>
      )}

      {archivadas.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setVerArchivadas((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline self-start">
            {verArchivadas ? t('Ocultar') : t('Ver')} {t('archivadas')} ({archivadas.length})
          </button>
          {verArchivadas &&
            archivadas.map((a) => (
              <div key={a.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex items-center justify-between gap-2 opacity-70">
                <p className="text-sm">{a.nombre}</p>
                <Boton variante="secundario" tamano="sm" disabled={procesando === a.id} onClick={() => restaurar(a)}>
                  {t('Restaurar')}
                </Boton>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
