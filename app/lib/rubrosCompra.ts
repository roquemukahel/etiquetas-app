import type { SupabaseClient } from '@supabase/supabase-js';

// Las compras a proveedores se clasifican por RUBRO (las mismas categorías del
// Stock) y pueden llevar la foto de la factura. Eso necesita columnas nuevas
// (compra_contado_rubros_supabase.sql). Mientras un negocio no corrió esa
// migración, las pantallas siguen funcionando como siempre y simplemente no
// ofrecen rubro/contado: este chequeo se hace una sola vez por sesión.
let soporte: Promise<boolean> | null = null;
export function soportaRubrosCompra(supabase: SupabaseClient): Promise<boolean> {
  if (!soporte) {
    soporte = Promise.resolve(supabase.from('compras_proveedor').select('categoria_id, compra_grupo_id, tiene_factura').limit(1)).then(
      ({ error }) => !error,
      () => false
    );
  }
  return soporte;
}

export type LineaRubro = { categoriaId: string; monto: string };

const CENTAVO = 0.005;

// Una compra repartida entre varios rubros tiene que cerrar con el total: cada
// línea con rubro y monto, y la suma igual al monto de la compra.
export function validarReparto(lineas: LineaRubro[], total: number): string | null {
  if (lineas.length === 0) return 'Elegí el rubro de la compra.';
  if (lineas.some((l) => !l.categoriaId)) return 'Elegí el rubro de cada línea.';
  if (lineas.length === 1) return null; // un solo rubro: lleva el total completo
  if (lineas.some((l) => !(Number(l.monto) > 0))) return 'Cada rubro tiene que tener un monto mayor a 0.';
  const suma = lineas.reduce((acc, l) => acc + Number(l.monto), 0);
  if (Math.abs(suma - total) > CENTAVO) return 'Los montos de los rubros tienen que sumar el total de la compra.';
  return null;
}

// Montos finales por rubro: con una sola línea, el total completo.
export function montosPorRubro(lineas: LineaRubro[], total: number): { categoriaId: string; monto: number }[] {
  if (lineas.length === 1) return [{ categoriaId: lineas[0].categoriaId, monto: total }];
  return lineas.map((l) => ({ categoriaId: l.categoriaId, monto: Number(l.monto) }));
}

// Pago de una compra: "pagué todo" o "pagué una parte y quedé debiendo $X".
// Devuelve cuánto se paga ahora, o un error si lo que se debe no tiene sentido.
export function pagoDeCompra(total: number, quedaDebiendo: string | null): { pagado: number } | { error: string } {
  if (quedaDebiendo === null) return { pagado: total };
  const debe = Number(quedaDebiendo);
  if (!(debe > 0)) return { error: 'Poné cuánto quedás debiendo (mayor a 0), o elegí "Pagué todo".' };
  if (debe > total + CENTAVO) return { error: 'Lo que quedás debiendo no puede ser más que el total de la compra.' };
  return { pagado: Math.max(0, total - debe) };
}
