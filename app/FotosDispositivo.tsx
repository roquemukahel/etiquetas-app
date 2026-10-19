'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import {
  MAX_FOTOS_POR_EQUIPO,
  eliminarFoto,
  guardarFotos,
  obtenerFotos,
  ponerFotoPrincipal,
  prepararFoto,
  type FotoDispositivo,
  type FotoPreparada,
} from './lib/fotosDispositivo';
import { soportaMigracion } from './lib/migraciones';
import { useT } from './lib/idioma';

const BOTON = 'rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-1.5 text-xs font-medium';

// Fotos reales de UN equipo ya cargado (Stock > equipo): subir (de a varias, desde la cámara o la galería),
// ver en grande, elegir la principal y borrar. Opcional: si el negocio no corrió dispositivo_fotos_supabase.sql
// la sección avisa y no hace nada.
export function FotosDispositivo({ dispositivoId, modelo, puedeEditar }: { dispositivoId: string; modelo: string | null; puedeEditar: boolean }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [fotos, setFotos] = useState<FotoDispositivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grande, setGrande] = useState<FotoDispositivo | null>(null);

  const cargar = async () => {
    const r = await obtenerFotos(supabase, dispositivoId);
    if ('error' in r) setError(`${t('No pudimos cargar las fotos:')} ${r.error}`);
    else setFotos(r);
    setCargando(false);
  };

  useEffect(() => {
    soportaMigracion(supabase, 'fotosDispositivo').then((ok) => {
      setSoportado(ok);
      if (ok) cargar();
      else setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispositivoId]);

  const agregar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []).slice(0, Math.max(0, MAX_FOTOS_POR_EQUIPO - fotos.length));
    e.target.value = '';
    if (archivos.length === 0) return;
    setSubiendo(true);
    setError(null);
    try {
      const preparadas = await Promise.all(archivos.map(prepararFoto));
      const siguiente = fotos.length > 0 ? Math.max(...fotos.map((f) => f.orden)) + 1 : 0;
      const { error: errorGuardar } = await guardarFotos(supabase, dispositivoId, preparadas, siguiente);
      if (errorGuardar) setError(`${t('No pudimos guardar las fotos:')} ${errorGuardar}`);
    } catch {
      setError(t('No pudimos leer alguna de las fotos. Probá con otra.'));
    }
    await cargar();
    setSubiendo(false);
  };

  const borrar = async (foto: FotoDispositivo) => {
    if (!confirm(t('¿Eliminar esta foto?'))) return;
    const { error: errorBorrar } = await eliminarFoto(supabase, foto, modelo);
    if (errorBorrar) setError(`${t('No pudimos eliminar la foto:')} ${errorBorrar}`);
    setGrande(null);
    await cargar();
  };

  const principal = async (foto: FotoDispositivo) => {
    const { error: errorPrincipal } = await ponerFotoPrincipal(supabase, foto, fotos);
    if (errorPrincipal) setError(`${t('No pudimos cambiar la foto principal:')} ${errorPrincipal}`);
    await cargar();
  };

  if (soportado === false) {
    return <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Las fotos reales todavía no están activadas en este negocio.')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? (
        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      ) : fotos.length === 0 ? (
        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Este equipo todavía no tiene fotos reales.')}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {fotos.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setGrande(f)}
              className="relative aspect-square overflow-hidden rounded-lg border border-border dark:border-dark-border bg-canvas dark:bg-dark-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.miniatura_url ?? f.foto_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              {i === 0 && fotos.length > 1 && <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">★ {t('Principal')}</span>}
            </button>
          ))}
        </div>
      )}
      {puedeEditar && (
        <div>
          <label className={`${BOTON} inline-block cursor-pointer ${subiendo || fotos.length >= MAX_FOTOS_POR_EQUIPO ? 'opacity-50 pointer-events-none' : ''}`}>
            {subiendo ? t('Subiendo...') : `📷 ${t('Agregar fotos')}`}
            <input type="file" accept="image/*" multiple className="hidden" onChange={agregar} disabled={subiendo || fotos.length >= MAX_FOTOS_POR_EQUIPO} />
          </label>
          <span className="ml-2 text-[11px] text-muted dark:text-dark-text-secondary">
            {fotos.length}/{MAX_FOTOS_POR_EQUIPO}
          </span>
        </div>
      )}

      {grande && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setGrande(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande.foto_url} alt="" className="max-h-[75vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {puedeEditar && fotos[0]?.id !== grande.id && (
              <button type="button" className={BOTON} onClick={() => principal(grande).then(() => setGrande(null))}>
                ★ {t('Hacer principal')}
              </button>
            )}
            {puedeEditar && (
              <button type="button" className={`${BOTON} text-bad`} onClick={() => borrar(grande)}>
                {t('Eliminar')}
              </button>
            )}
            <button type="button" className={BOTON} onClick={() => setGrande(null)}>
              {t('Cerrar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Para el alta de un equipo nuevo (Stock > Cargar dispositivo): elige las fotos antes de guardar; recién se
// suben cuando el equipo ya existe. `fotos` queda en el estado del formulario.
export function SelectorFotosNuevas({ fotos, onChange }: { fotos: FotoPreparada[]; onChange: (f: FotoPreparada[]) => void }) {
  const t = useT();
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []).slice(0, Math.max(0, MAX_FOTOS_POR_EQUIPO - fotos.length));
    e.target.value = '';
    if (archivos.length === 0) return;
    setLeyendo(true);
    setError(null);
    try {
      onChange([...fotos, ...(await Promise.all(archivos.map(prepararFoto)))]);
    } catch {
      setError(t('No pudimos leer alguna de las fotos. Probá con otra.'));
    }
    setLeyendo(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted dark:text-dark-text-secondary block">{t('Fotos reales del equipo (opcional)')}</label>
      {fotos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {fotos.map((f, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border dark:border-dark-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.miniatura_url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={t('Quitar foto')}
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/70 text-[11px] leading-none text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <label className={`${BOTON} inline-block cursor-pointer ${leyendo || fotos.length >= MAX_FOTOS_POR_EQUIPO ? 'opacity-50 pointer-events-none' : ''}`}>
          {leyendo ? t('Leyendo...') : `📷 ${t('Agregar fotos')}`}
          <input type="file" accept="image/*" multiple className="hidden" onChange={agregar} disabled={leyendo || fotos.length >= MAX_FOTOS_POR_EQUIPO} />
        </label>
        <span className="ml-2 text-[11px] text-muted dark:text-dark-text-secondary">
          {fotos.length}/{MAX_FOTOS_POR_EQUIPO}
        </span>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
