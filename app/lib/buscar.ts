// Búsqueda por texto para las listas de la app (Plan Canje, y las que se sumen): cada palabra tipeada tiene que aparecer
// en algún dato del elemento, sin importar mayúsculas, acentos ni el orden. "13 azul 128" encuentra un iPhone 13 azul de
// 128 GB y "0297" encuentra el equipo cuyo IMEI tiene esos dígitos en cualquier parte (no solo al principio).
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normalizarBusqueda(s: string): string {
  return sinAcentos(s).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

// El texto donde se busca de cada elemento se arma UNA vez (no en cada tecla).
export function pajarDe(campos: (string | number | null | undefined)[]): string {
  return normalizarBusqueda(campos.filter((c) => c != null && c !== '').join(' '));
}

export function coincideConTexto(pajar: string, texto: string): boolean {
  const palabras = normalizarBusqueda(texto).split(' ').filter(Boolean);
  return palabras.every((p) => pajar.includes(p));
}

export function buscarPorTexto<T>(items: T[], texto: string, camposDe: (item: T) => (string | number | null | undefined)[]): T[] {
  if (!normalizarBusqueda(texto)) return items;
  return items.filter((i) => coincideConTexto(pajarDe(camposDe(i)), texto));
}
