'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from './supabase/client';

// La paleta de colores por hex (SelectorColor) es el fallback para modelos que
// todavía NO tienen fotos por color (todo lo que no sea iPhone). Regla pedida
// por el usuario: la paleta solo se ofrece si el negocio vende alguna marca
// distinta de iPhone (Samsung, Xiaomi u "Otras marcas"). Un local solo-iPhone
// no ve paleta en ningún lado — para iPhone siempre se muestran las fotos.
//
// Se consulta en cada montaje (sin caché persistente) para que, si el negocio
// acaba de activar/desactivar una marca en Configuración, el cambio se refleje
// al entrar a la pantalla siguiente sin tener que recargar.
export function usePaletaColor(): boolean | null {
  // null = todavía cargando (no mostramos nada para no parpadear una paleta
  // que quizás no corresponde).
  const [estado, setEstado] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const supabase = crearClienteNavegador();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (vivo) setEstado(false);
          return;
        }
        const { data } = await supabase.from('perfiles').select('negocios ( marcas_stock )').eq('id', user.id).single();
        const marcas: string[] = (data as any)?.negocios?.marcas_stock ?? [];
        const usa = Array.isArray(marcas) && marcas.some((m) => m !== 'iphone');
        if (vivo) setEstado(usa);
      } catch {
        // Ante cualquier falla, dejar la paleta disponible (no bloquear la
        // carga de un dispositivo que no sea iPhone).
        if (vivo) setEstado(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
