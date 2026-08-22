// Lado servidor de app/lib/sucursal.ts — para Server Components (ej.
// app/page.tsx) que necesitan saber "en qué sucursal está trabajando este
// navegador" antes de consultar Supabase. Lee la cookie espejo
// `qovento_sucursal` que escribe useSucursalActual() (cliente). Mismo
// patrón que app/lib/idiomaServidor.ts.
import { cookies } from 'next/headers';

export function obtenerSucursalServidor(): string | null {
  const valor = cookies().get('qovento_sucursal')?.value;
  return valor ? valor : null;
}
