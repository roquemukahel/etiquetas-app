// Equipo que un cliente deja como parte de pago de una deuda (queda en Plan Canje hasta que se agregue al Stock).
import { formatearGB } from './almacenamiento';
import { normalizarNombreModelo } from './modelos';

export type EquipoPago = {
  modelo: string;
  capacidad_gb: number | null;
  color: string;
  imei: string;
  bateria: string;
  condicion: string; // 'usado' | 'sellado'
  detalles: string;
};

export const EQUIPO_PAGO_VACIO: EquipoPago = { modelo: '', capacidad_gb: null, color: '', imei: '', bateria: '', condicion: 'usado', detalles: '' };

// Qué falta para poder registrar el equipo; null si está completo. Devuelve el texto en español (quien llama lo traduce).
export function problemaDelEquipo(e: EquipoPago): string | null {
  if (!e.modelo.trim()) return 'Poné el modelo del equipo que recibís como pago.';
  const bateria = e.bateria.trim();
  if (bateria && (!/^\d+$/.test(bateria) || Number(bateria) > 100)) return 'La salud de batería tiene que ser un número entre 0 y 100.';
  return null;
}

// "iPhone 13 128GB Azul" para la observación del pago, la auditoría y el comprobante.
export function descripcionDelEquipo(e: EquipoPago): string {
  return [normalizarNombreModelo(e.modelo.trim()), e.capacidad_gb ? formatearGB(e.capacidad_gb) : null, e.color.trim() || null].filter(Boolean).join(' ');
}
