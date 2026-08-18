'use client';

import { useState } from 'react';
import { comprimirImagen } from '../lib/comprimirImagen';

export type ControlCalidadItem = {
  id: string;
  item: string;
  resultado: string;
  observacion: string | null;
  foto_url: string | null;
  actor_nombre: string | null;
  created_at: string;
};

// Checklist de control de calidad de una reparación puntual — sección 17
// del rediseño. Cada ítem se guarda apenas se toca un resultado (no hay
// botón de "guardar" global), para no perder nada si alguien cierra la
// pestaña a mitad de camino.
export default function ControlCalidad({
  checklist,
  registros,
  onGuardar,
  soloLectura,
}: {
  checklist: string[];
  registros: ControlCalidadItem[];
  onGuardar: (item: string, resultado: string, observacion: string | null, fotoUrl: string | null) => void;
  soloLectura: boolean;
}) {
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  const [fotosNuevas, setFotosNuevas] = useState<Record<string, string>>({});

  const registroDe = (item: string) => registros.find((r) => r.item === item);
  const controlados = checklist.filter((item) => registroDe(item)).length;

  const elegirFoto = async (item: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await comprimirImagen(file);
      setFotosNuevas((p) => ({ ...p, [item]: dataUrl }));
      const reg = registroDe(item);
      if (reg) onGuardar(item, reg.resultado, reg.observacion, dataUrl);
    } catch {}
  };

  const guardar = (item: string, resultado: string) => {
    const reg = registroDe(item);
    const obs = observaciones[item] ?? reg?.observacion ?? null;
    const foto = fotosNuevas[item] ?? reg?.foto_url ?? null;
    onGuardar(item, resultado, obs, foto);
  };

  const guardarObservacion = (item: string) => {
    const reg = registroDe(item);
    if (!reg) return;
    onGuardar(item, reg.resultado, observaciones[item] ?? reg.observacion ?? null, reg.foto_url);
  };

  const RESULTADOS: { id: string; icono: string; titulo: string; activo: string }[] = [
    { id: 'correcto', icono: '✅', titulo: 'Correcto', activo: 'bg-good text-white' },
    { id: 'falla', icono: '❌', titulo: 'Falla', activo: 'bg-bad text-white' },
    { id: 'no_aplica', icono: '➖', titulo: 'No aplica', activo: 'bg-muted text-white' },
  ];

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium text-muted dark:text-dark-text-secondary -mt-1 mb-1">
        {controlados}/{checklist.length} controlados
      </p>
      {checklist.map((item) => {
        const reg = registroDe(item);
        const fotoActual = fotosNuevas[item] ?? reg?.foto_url ?? null;
        return (
          <div key={item} className="border-b border-border dark:border-dark-border py-2 flex flex-col gap-1.5 last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="basis-full sm:basis-0 sm:flex-1 min-w-0 text-sm">{item}</span>
              {fotoActual && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoActual} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
              )}
              {!soloLectura && (
                <label className="shrink-0 text-sm cursor-pointer" aria-label={`Foto de ${item}`}>
                  📷
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => elegirFoto(item, e)} />
                </label>
              )}
              <div className="flex gap-1 shrink-0">
                {RESULTADOS.map((res) => (
                  <button
                    key={res.id}
                    disabled={soloLectura}
                    onClick={() => guardar(item, res.id)}
                    aria-label={`${item}: ${res.titulo}`}
                    aria-pressed={reg?.resultado === res.id}
                    title={res.titulo}
                    className={`h-7 w-7 rounded-lg text-xs flex items-center justify-center disabled:opacity-50 ${
                      reg?.resultado === res.id ? res.activo : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {res.icono}
                  </button>
                ))}
              </div>
            </div>
            {reg && !soloLectura && (
              <input
                value={observaciones[item] ?? reg.observacion ?? ''}
                onChange={(e) => setObservaciones((p) => ({ ...p, [item]: e.target.value }))}
                onBlur={() => guardarObservacion(item)}
                placeholder="Observación (opcional)"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-xs"
              />
            )}
            {reg?.observacion && soloLectura && <p className="text-xs text-muted dark:text-dark-text-secondary">{reg.observacion}</p>}
            {reg && (
              <p className="text-[10px] text-muted dark:text-dark-text-secondary">
                {reg.actor_nombre ? `${reg.actor_nombre} · ` : ''}
                {new Date(reg.created_at).toLocaleString('es-AR')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
