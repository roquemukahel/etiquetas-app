// Encabezado de cada día en Órdenes. Antes sumaba todo junto: una venta financiada genera dos órdenes (la venta por el precio
// financiado completo y el cobro de la cuota 1 el mismo día) y los cobros de cuotas viejas también entraban como si fueran
// ventas. Ahora se muestran por separado: ventas, cobros de cuotas / cuenta corriente, y la plata que de verdad entró a caja.

export type OrdenParaResumen = {
  estado: string;
  total: number | null;
  // Cobro de una cuota o de cuenta corriente (la orden que genera "Registrar pago"), no una venta.
  esCobro: boolean;
};

export type ResumenVentasCobros = {
  ventas: { cantidad: number; monto: number };
  cobros: { cantidad: number; monto: number };
};

// Una orden cancelada sigue visible en la lista pero no es plata vendida ni cobrada.
export function resumirDia(ordenes: OrdenParaResumen[]): ResumenVentasCobros {
  const resumen: ResumenVentasCobros = { ventas: { cantidad: 0, monto: 0 }, cobros: { cantidad: 0, monto: 0 } };
  for (const o of ordenes) {
    if (o.estado === 'cancelado') continue;
    const destino = o.esCobro ? resumen.cobros : resumen.ventas;
    destino.cantidad += 1;
    destino.monto += Number(o.total) || 0;
  }
  return resumen;
}

export type PagoParaResumen = {
  fecha: string;
  monto: number | string | null;
  medio: string;
  moneda: string;
  sucursal_id?: string | null;
};

// Plata que entró a caja un día (por la fecha del pago, no de la orden): suma los pagos reales de ese día. Un equipo entregado
// como parte de pago (medio 'canje') no es plata, y un pago en otra moneda no se mezcla con la principal.
export function ingresadoACajaDelDia(
  pagos: PagoParaResumen[],
  claveDia: string,
  opciones: { moneda: string; sucursalId?: string | null }
): number {
  let total = 0;
  for (const p of pagos) {
    if (p.medio === 'canje') continue;
    if (p.moneda !== opciones.moneda) continue;
    if (opciones.sucursalId && p.sucursal_id !== opciones.sucursalId) continue;
    // Mismo formato de fecha local (AAAA-MM-DD) que usa la lista para agrupar las órdenes por día.
    if (new Date(p.fecha).toLocaleDateString('en-CA') !== claveDia) continue;
    total += Number(p.monto) || 0;
  }
  return total;
}
