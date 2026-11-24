'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { marcarTurnoRevisado, type TurnoCaja } from '../lib/caja/servicio';
import { registrarAuditoria } from '../lib/auditoria';
import { useIdioma, useT } from '../lib/idioma';
import { localeDe } from '../lib/i18n/traducir';
import { formatearFechaHora } from '../lib/fechas';

// Casilla "Revisada" de un cierre de caja: quien controla el cierre (que el efectivo, las transferencias y la diferencia
// estén bien) lo tilda, y queda anotado quién y cuándo. Solo la pueden tildar o destildar quienes tienen permiso de revisar;
// el resto ve el estado. Si todavía no se corrió caja_revisada_supabase.sql (el cierre no trae el dato) no se muestra nada.
export default function CasillaRevisada({
  supabase,
  turno,
  cajaNombre,
  puedeRevisar,
  quien,
  onCambio,
}: {
  supabase: SupabaseClient;
  turno: TurnoCaja;
  cajaNombre: string;
  puedeRevisar: boolean;
  quien: string | null;
  onCambio: (actualizado: TurnoCaja) => void;
}) {
  const t = useT();
  const locale = localeDe(useIdioma());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (turno.estado !== 'cerrada' || turno.revisada === undefined) return null;
  const revisada = turno.revisada === true;

  const cambiar = async (nueva: boolean) => {
    setGuardando(true);
    setError(null);
    const { error: err, cambios } = await marcarTurnoRevisado(supabase, turno.id, nueva, quien);
    setGuardando(false);
    if (err) {
      setError(`${t('No pudimos guardar el cambio:')} ${err}`);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `${nueva ? 'marcó como revisado' : 'quitó la marca de revisado de'} el cierre N° ${turno.numero} de ${cajaNombre}`,
      entidad: 'caja_turno',
      entidadId: turno.id,
      valorAnterior: { revisada },
      valorNuevo: { revisada: nueva },
    });
    onCambio({ ...turno, ...cambios });
  };

  return (
    <div className="flex flex-col gap-0.5">
      <label className={`no-print inline-flex items-center gap-2 text-xs font-medium ${puedeRevisar ? 'cursor-pointer' : 'opacity-70'}`}>
        <input
          type="checkbox"
          checked={revisada}
          disabled={!puedeRevisar || guardando}
          onChange={(e) => cambiar(e.target.checked)}
          className="h-4 w-4 accent-good"
        />
        <span className={revisada ? 'text-good' : 'text-muted dark:text-dark-text-secondary'}>{revisada ? t('Revisada') : t('Sin revisar')}</span>
      </label>
      {revisada && (turno.revisada_por || turno.revisada_en) && (
        <p className="text-[11px] text-muted dark:text-dark-text-secondary">
          {t('Revisada por')} {turno.revisada_por ?? '—'}
          {turno.revisada_en && ` · ${formatearFechaHora(turno.revisada_en, locale)}`}
        </p>
      )}
      {error && <p className="no-print text-[11px] text-bad">{error}</p>}
    </div>
  );
}
