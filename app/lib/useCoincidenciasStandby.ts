'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coincidenciasPorImeiOModelo } from './canje';
import { COLUMNAS_STANDBY_AVISO, equiposEnStandby, type EquipoStandbyAviso } from './standby';

// Igual que useCoincidenciasCanje: devuelve cuáles equipos de Standby pueden ser el que se está tipeando (por IMEI
// o, si no hay IMEI, por modelo). Se pide la lista de Standby recién cuando se empieza a escribir un IMEI o hay un
// modelo (no al abrir el formulario) y solo con las columnas que hacen falta, así el formulario abre igual de rápido
// aunque haya muchos equipos en Standby. Si Standby no existe o no se puede leer, devuelve vacío y no hay aviso.
export function useCoincidenciasStandby(supabase: SupabaseClient, imei: string, modelo: string) {
  const [enStandby, setEnStandby] = useState<EquipoStandbyAviso[]>([]);
  const [pedido, setPedido] = useState(false);
  const hayQueBuscar = imei.trim().length >= 2 || modelo.trim().length > 0;
  // Si la pantalla se cierra antes de que llegue la lista no se guarda nada; borrar y volver a escribir NO cancela el pedido.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  useEffect(() => {
    if (!hayQueBuscar || pedido) return;
    setPedido(true);
    equiposEnStandby<EquipoStandbyAviso>(supabase, COLUMNAS_STANDBY_AVISO)
      .then((e) => {
        if (montado.current) setEnStandby(e);
      })
      .catch(() => {
        // Sin Standby legible, no hay aviso.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayQueBuscar]);
  return useMemo(() => coincidenciasPorImeiOModelo(enStandby, imei, modelo), [enStandby, imei, modelo]);
}
