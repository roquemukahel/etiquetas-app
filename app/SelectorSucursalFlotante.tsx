'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import { useActor } from './lib/actor';
import { useSucursalActual, setSucursalManual } from './lib/sucursal';
import { obtenerSucursales, type Sucursal } from './lib/sucursales';
import { useT } from './lib/idioma';

// Solo aparece si (a) el negocio tiene sucursales cargadas (activó el
// módulo — ver Configuración > Sucursales) y (b) la persona elegida no
// tiene una sucursal FIJA asignada (si la tiene, useSucursalActual() ya la
// usa sola, sin preguntar nada — ver app/lib/sucursal.ts). Pensado para el
// dueño/administrador que circula entre locales.
export default function SelectorSucursalFlotante() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const { id: sucursalId, fija } = useSucursalActual();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    if (fija || cargado) return;
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
      setCargado(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fija, cargado]);

  if (fija || sucursales.length === 0 || !actor) return null;

  const actualNombre = sucursales.find((s) => s.id === sucursalId)?.nombre;

  return (
    <div className="no-print fixed bottom-3 left-3 z-40">
      {abierto && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1">
          {sucursales.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSucursalManual(s.id);
                setAbierto(false);
              }}
              className={`block w-full text-left px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg ${
                s.id === sucursalId ? 'font-medium text-accent dark:text-dark-accent' : ''
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="rounded-full border border-white/30 bg-ink/70 text-white text-xs font-medium px-2.5 py-1 backdrop-blur-sm hover:bg-ink/90 transition-colors"
      >
        🏬 {actualNombre || t('Elegí tu sucursal')}
      </button>
    </div>
  );
}
