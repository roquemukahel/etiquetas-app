// ============================================================
// Filtra y reordena los artículos que ya vinieron de la búsqueda de texto
// completo en Postgres (ver servicio.ts) — filtra por rol autorizado y le
// da prioridad a los del módulo donde está parado el usuario. Pura: recibe
// los artículos ya encontrados, no hace la búsqueda en sí.
// ============================================================
import { rolAutorizado, type RolQovi } from './rol';
import { QOVI_MAX_FRAGMENTOS } from './config';
import type { ModuloQovi } from './modulos';

export type ArticuloQovi = {
  id: string;
  titulo: string;
  slug: string;
  modulo: string;
  contenido: string;
  roles_autorizados: string[];
  acciones_navegacion: string[];
  ruta_relacionada: string | null;
};

export function filtrarYPriorizarArticulos(
  articulos: ArticuloQovi[],
  rol: RolQovi,
  moduloActual: ModuloQovi
): ArticuloQovi[] {
  const permitidos = articulos.filter((a) => rolAutorizado(a.roles_autorizados, rol));
  const ordenados = [...permitidos].sort((a, b) => {
    const aEsDelModulo = a.modulo === moduloActual ? 1 : 0;
    const bEsDelModulo = b.modulo === moduloActual ? 1 : 0;
    return bEsDelModulo - aEsDelModulo; // los del módulo actual primero (sort estable: conserva el orden de relevancia de texto dentro de cada grupo)
  });
  return ordenados.slice(0, QOVI_MAX_FRAGMENTOS);
}
