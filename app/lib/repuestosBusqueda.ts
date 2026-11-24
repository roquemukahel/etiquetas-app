// Búsqueda de repuestos del stock para usar en una reparación (ficha de Servicio Técnico y la pregunta "¿se usó repuesto?").

type RepuestoBuscable = { nombre: string; calidad?: string | null; sucursal_id?: string | null; cantidad_stock: number };

// Por palabras (no por frase exacta) sobre nombre + calidad: "modulo g60s premium" encuentra "Modulo Motorola g60s" de calidad Premium.
export function palabrasDeBusqueda(texto: string): string[] {
  return texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function repuestoCoincide(rp: Pick<RepuestoBuscable, 'nombre' | 'calidad'>, palabras: string[]): boolean {
  const texto = `${rp.nombre} ${rp.calidad ?? ''}`.toLowerCase();
  return palabras.every((p) => texto.includes(p));
}

// Un repuesto sin sucursal es stock viejo (de antes de multisucursal): se ofrece en cualquier sucursal para no esconder stock real. Se filtra
// por la sucursal de la ORDEN, no por la elegida en el menú de arriba. Una orden sin sucursal no filtra.
export function repuestoEnSucursal(rp: Pick<RepuestoBuscable, 'sucursal_id'>, sucursalDeLaOrden: string | null | undefined): boolean {
  return !sucursalDeLaOrden || rp.sucursal_id == null || rp.sucursal_id === sucursalDeLaOrden;
}

export function repuestosDisponibles<T extends RepuestoBuscable>(repuestos: T[], busqueda: string, sucursalDeLaOrden: string | null | undefined): T[] {
  const palabras = palabrasDeBusqueda(busqueda);
  return repuestos.filter((rp) => rp.cantidad_stock > 0 && repuestoCoincide(rp, palabras) && repuestoEnSucursal(rp, sucursalDeLaOrden));
}
