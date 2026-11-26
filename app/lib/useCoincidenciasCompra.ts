'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { comprasCoincidentes, comprasPendientes, type CompraParaStock } from './compras';

// Carga una vez las compras pendientes (todavía no ingresadas al Stock) y devuelve cuáles pueden ser
// el equipo que se está tipeando (por IMEI o, si no hay IMEI, por modelo). Mismo criterio que
// useCoincidenciasCanje/useCoincidenciasStandby. Si no se puede leer Compras, devuelve vacío: el
// formulario sigue sin el aviso.
export function useCoincidenciasCompra(supabase: SupabaseClient, imei: string, modelo: string) {
  const [pendientes, setPendientes] = useState<CompraParaStock[]>([]);
  useEffect(() => {
    let vivo = true;
    comprasPendientes(supabase)
      .then((p) => {
        if (vivo) setPendientes(p);
      })
      .catch(() => {
        // Sin Compras legible, no hay aviso.
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => comprasCoincidentes(pendientes, imei, modelo), [pendientes, imei, modelo]);
}
