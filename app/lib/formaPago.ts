import { CUENTA_CORRIENTE, MEDIOS_PAGO, medioLabel } from './cuentaCorriente';

// La forma de pago de una orden/reparación se guarda como TEXTO legible
// ("Efectivo", "Débito", "Efectivo + Transferencia") — el detalle real de la
// plata vive en la tabla `pagos`. Esto convierte entre ese texto y los códigos
// de medio (MEDIOS_PAGO), igual que arma la etiqueta Nueva Orden.
export const SEPARADOR_MEDIOS = ' + ';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// 'Tarjeta' es el valor viejo (antes de separar Débito/Crédito): se interpreta
// como débito para poder precargar el cobro, y la persona lo corrige si hace falta.
function codigoDeTexto(texto: string): string | null {
  const t = sinAcentos(texto);
  if (!t) return null;
  if (t === 'cuenta corriente') return CUENTA_CORRIENTE;
  if (t === 'tarjeta') return 'debito';
  const medio = MEDIOS_PAGO.find((m) => sinAcentos(m.label) === t || m.codigo === t);
  return medio ? medio.codigo : null;
}

// Códigos de medio que aparecen en una etiqueta ('Efectivo + Débito' ->
// ['efectivo', 'debito']), sin repetidos y sin textos desconocidos.
export function mediosDeEtiqueta(etiqueta: string | null | undefined): string[] {
  if (!etiqueta) return [];
  const codigos = etiqueta
    .split('+')
    .map(codigoDeTexto)
    .filter((c): c is string => c !== null);
  return Array.from(new Set(codigos));
}

// Etiqueta legible para guardar, en el orden estándar de MEDIOS_PAGO (así
// "Transferencia + Efectivo" y "Efectivo + Transferencia" quedan iguales).
export function etiquetaDeMedios(codigos: string[]): string {
  const orden = [...MEDIOS_PAGO.map((m) => m.codigo as string), CUENTA_CORRIENTE];
  const unicos = Array.from(new Set(codigos)).sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  return unicos.map((c) => medioLabel(c)).join(SEPARADOR_MEDIOS);
}

// Reparte un total entre varios medios cuando todavía no se sabe cuánto va en
// cada uno: el primero se queda con todo y el resto en cero, para que quien
// cobra ajuste los montos (nunca se inventa una división 50/50).
export type LineaCobro = { medio: string; monto: string };

export function lineasIniciales(medios: string[], total: number): LineaCobro[] {
  const usar = medios.length > 0 ? medios : ['efectivo'];
  return usar.map((medio, i) => ({ medio, monto: i === 0 && total > 0 ? String(Math.round(total * 100) / 100) : '' }));
}

// Diferencia entre lo asignado y el total, en la misma moneda — con tolerancia
// de un centavo para no bloquear por redondeo.
export function restanteDeLineas(lineas: LineaCobro[], total: number): number {
  const asignado = lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  return Math.round((total - asignado) * 100) / 100;
}

export function lineasCierranConElTotal(lineas: LineaCobro[], total: number): boolean {
  return Math.abs(restanteDeLineas(lineas, total)) < 0.01;
}
