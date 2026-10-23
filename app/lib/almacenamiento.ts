// Capacidades de almacenamiento que se pueden elegir al cargar un equipo (se guardan siempre en GB: 1 TB = 1024).
export const OPCIONES_ALMACENAMIENTO = [64, 128, 256, 512, 1024, 2048];

// "128GB", "512GB", "1TB", "2TB". Con `conEspacio` queda "128 GB" / "1 TB". Los TB se muestran solo si son exactos
// (1024, 2048...); cualquier otro valor se muestra en GB. Sin valor devuelve ''.
export function formatearGB(gb: number | string | null | undefined, conEspacio = false): string {
  const n = Number(gb);
  if (gb == null || gb === '' || !Number.isFinite(n) || n <= 0) return '';
  const sp = conEspacio ? ' ' : '';
  return n >= 1024 && n % 1024 === 0 ? `${n / 1024}${sp}TB` : `${n}${sp}GB`;
}

// Lee una capacidad escrita en texto ("128GB", "256 gb", "1TB", "2 tb") y la devuelve en GB (null si no hay).
export function extraerCapacidadGB(texto: string): number | null {
  const tb = texto.match(/(\d+(?:[.,]\d+)?)\s?tb/i);
  if (tb) return Math.round(Number(tb[1].replace(',', '.')) * 1024);
  const gb = texto.match(/(\d+)\s?gb/i);
  return gb ? Number(gb[1]) : null;
}
