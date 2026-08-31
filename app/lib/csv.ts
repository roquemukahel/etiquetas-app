import Papa from 'papaparse';
import type * as ExcelJSNamespace from 'exceljs';

type ExcelJSModulo = typeof ExcelJSNamespace;

// ExcelJS es una librería pesada (varios cientos de KB) que hasta hace poco
// se importaba arriba de todo — eso la sumaba al bundle de Clientes/Stock/
// Exportar datos para TODO el mundo, incluso quien nunca toca Excel (CSV
// sigue siendo el formato por defecto). Se carga bajo demanda, solo la
// primera vez que hace falta leer o generar un .xlsx real, y se cachea acá
// para no volver a pedirla en la misma pestaña.
let cargaExcelJS: Promise<ExcelJSModulo> | null = null;
function cargarExcelJS(): Promise<ExcelJSModulo> {
  if (!cargaExcelJS) cargaExcelJS = import('exceljs');
  return cargaExcelJS;
}

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

// Convierte una celda de ExcelJS (puede ser texto plano, rich text, fecha,
// número o fórmula ya calculada) al mismo formato de string que devuelve
// Papa.parse para CSV, así valorDe() y el resto del código de importación no
// necesitan saber si el archivo original era CSV o Excel.
function celdaATexto(valor: ExcelJSNamespace.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((r) => r.text).join('');
    if ('text' in valor) return String(valor.text ?? '');
    if ('result' in valor) return celdaATexto(valor.result as ExcelJSNamespace.CellValue);
  }
  return String(valor).trim();
}

// Lee un archivo Excel (.xlsx/.xls) del usuario y devuelve las filas como
// objetos, usando la primera fila de la primera hoja como encabezados —
// mismo formato que leerCSV.
async function leerXLSX(archivo: File): Promise<Record<string, string>[]> {
  const ExcelJS = await cargarExcelJS();
  const buffer = await archivo.arrayBuffer();
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];

  let encabezados: string[] = [];
  const filas: Record<string, string>[] = [];
  hoja.eachRow((fila, numeroFila) => {
    const valores = (fila.values as ExcelJSNamespace.CellValue[]).slice(1).map(celdaATexto);
    if (numeroFila === 1) {
      encabezados = valores;
      return;
    }
    if (valores.every((v) => !v)) return; // fila vacía
    const obj: Record<string, string> = {};
    encabezados.forEach((h, i) => {
      if (h) obj[h] = valores[i] ?? '';
    });
    filas.push(obj);
  });
  return filas;
}

// Lee un archivo del usuario sea CSV o Excel (.xlsx/.xls), detectando el
// formato por la extensión — mismo formato de salida en los dos casos, así
// el resto del código de importación no necesita distinguirlos.
export function leerArchivoDatos(archivo: File): Promise<Record<string, string>[]> {
  return /\.xlsx?$/i.test(archivo.name) ? leerXLSX(archivo) : leerCSV(archivo);
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

// Arma un archivo Excel (.xlsx) a partir de filas de objetos, con las
// columnas en el orden indicado, y descarga el archivo en el navegador —
// misma firma que descargarCSV.
export async function descargarXLSX(nombreArchivo: string, columnas: string[], filas: Record<string, unknown>[]) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Datos');
  hoja.addRow(columnas);
  for (const fila of filas) {
    hoja.addRow(columnas.map((c) => (fila[c] as string | number | undefined) ?? ''));
  }
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Punto único para exportar en el formato que haya elegido el usuario —
// arma el nombre de archivo con la extensión correcta a partir de un
// nombre base sin extensión (ej. "clientes-qovento").
export async function descargarDatos(
  nombreBase: string,
  columnas: string[],
  filas: Record<string, unknown>[],
  formato: 'csv' | 'xlsx'
) {
  if (formato === 'xlsx') {
    await descargarXLSX(`${nombreBase}.xlsx`, columnas, filas);
  } else {
    descargarCSV(`${nombreBase}.csv`, columnas, filas);
  }
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
