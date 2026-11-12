import { reconciliarComisionesClienteAccion } from '../../comisiones/acciones';
import { registrarFallo } from '../escritura';

// Después de cobrar, anular o corregir un pago de un cliente: pide al servidor que ajuste las comisiones de sus ventas financiadas a
// lo cobrado (solo hace algo si el negocio eligió generar la comisión "sobre lo cobrado"). Nunca frena ni rompe el cobro: si falla
// queda registrado y la comisión se ajusta en el próximo pago.
export async function sincronizarComisionesDeCliente(clienteId: string | null | undefined): Promise<void> {
  if (!clienteId) return;
  try {
    const r = await reconciliarComisionesClienteAccion(clienteId);
    if (r.error) registrarFallo(new Error(r.error), 'ajustar las comisiones de las ventas financiadas del cliente');
  } catch (e) {
    registrarFallo(e, 'ajustar las comisiones de las ventas financiadas del cliente');
  }
}
