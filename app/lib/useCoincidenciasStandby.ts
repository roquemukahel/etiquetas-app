'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coincidenciasPorImeiOModelo } from './canje';
import { equiposEnStandby, type EquipoStandby } from './standby';

// Igual que useCoincidenciasCanje: carga una vez los equipos que están en Standby y devuelve cuáles pueden ser el
// equipo que se está tipeando (por IMEI o, si no hay IMEI, por modelo). Si Standby no existe o no se puede leer,
// devuelve vacío y el formulario sigue sin el aviso.
export function useCoincidenciasStandby(supabase: SupabaseClient, imei: string, modelo: string) {
  const [enStandby, setEnStandby] = useState<EquipoStandby[]>([]);
  useEffect(() => {
    let vivo = true;
    equiposEnStandby(supabase)
      .then((e) => {
        if (vivo) setEnStandby(e);
      })
      .catch(() => {
        // Sin Standby legible, no hay aviso.
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => coincidenciasPorImeiOModelo(enStandby, imei, modelo), [enStandby, imei, modelo]);
}
