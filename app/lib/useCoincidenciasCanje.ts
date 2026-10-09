'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canjesCoincidentes, canjesPendientes, type CanjeParaStock } from './canje';

// Carga una vez los canjes que esperan en Plan Canje y devuelve cuáles pueden ser el equipo que
// se está tipeando (por IMEI o, si no hay IMEI, por modelo). Si no se puede leer Plan Canje
// (sin permiso, tabla ausente, sin red) devuelve vacío: el formulario sigue sin el aviso.
export function useCoincidenciasCanje(supabase: SupabaseClient, imei: string, modelo: string) {
  const [pendientes, setPendientes] = useState<CanjeParaStock[]>([]);
  useEffect(() => {
    let vivo = true;
    canjesPendientes(supabase)
      .then((p) => {
        if (vivo) setPendientes(p);
      })
      .catch(() => {
        // Sin Plan Canje legible, no hay aviso.
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => canjesCoincidentes(pendientes, imei, modelo), [pendientes, imei, modelo]);
}
