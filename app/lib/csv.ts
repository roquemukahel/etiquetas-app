import Papa from 'papaparse';

// Lee un archivo CSV del usuario (input type="file") y devuelve las filas
// como objetos, usando la primera línea como encabezados. Tolera comas
// dentro de campos entre comillas (ej. direcciones "Calle 1, piso 2").
export function leerCSV(archivo: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(archivo, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => resolve(resultado.data),
      error: (error) => reject(error),
    });
  });
}

// Busca en una fila el primer valor no vacío entre varios nombres de
// columna posibles (para reconocer tanto el formato propio de Qovento
// como el de sistemas de terceros con otros nombres de encabezado).
export function valorDe(fila: Record<string, string>, ...claves: string[]): string {
  for (const clave of claves) {
    const encontrada = Object.keys(fila).find((k) => k.trim().toLowerCase() === clave.toLowerCase());
    if (encontrada && fila[encontrada]?.trim()) return fila[encontrada].trim();
  }
  return '';
}

// Arma un CSV a partir de filas de objetos, con las columnas en el orden
// indicado, y descarga el archivo en el navegador.
export function descargarCSV(nombreArchivo: string, columnas: string[], filas: Record<string, unknown>[]) {
  const csv = Papa.unparse({
    fields: columnas,
    data: filas.map((fila) => columnas.map((c) => fila[c] ?? '')),
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Inserta filas en tandas para no exceder límites de tamaño de request,
// devolviendo cuántas se guardaron y el primer error si algo falló.
export async function insertarEnTandas<T extends Record<string, unknown>>(
  insertar: (tanda: T[]) => PromiseLike<{ error: { message: string } | null }>,
  filas: T[],
  tamanoTanda: number,
  onProgreso?: (hechas: number, total: number) => void
): Promise<{ guardadas: number; error: string | null }> {
  let guardadas = 0;
  for (let i = 0; i < filas.length; i += tamanoTanda) {
    const tanda = filas.slice(i, i + tamanoTanda);
    const { error } = await insertar(tanda);
    if (error) return { guardadas, error: error.message };
    guardadas += tanda.length;
    onProgreso?.(guardadas, filas.length);
  }
  return { guardadas, error: null };
}
