// Historial de un producto (accesorios, tabla productos): arma, a partir de
// las filas crudas de producto_movimientos y de auditoria, lo que se le
// muestra a quien investiga "¿por qué me falta una unidad?".

export type MovimientoCrudo = {
  id: string;
  producto_id: string;
  tipo: string;
  cantidad: number;
  cantidad_resultante: number;
  motivo: string | null;
  usuario: string | null;
  orden_id: string | null;
  created_at: string;
  ordenes?: {
    numero_orden: string | null;
    vendedores: { nombre: string } | null;
    clientes: { nombre: string; apellido: string | null } | null;
  } | null;
};

export type MovimientoVista = MovimientoCrudo & {
  // Unidades que sumó (+) o restó (−). null = un "ajuste" cuyo sentido no se
  // puede deducir (la base solo guarda el tamaño del ajuste, no si sumó o restó).
  cambio: number | null;
  // Stock que había justo antes de este movimiento (null si no se puede deducir).
  stockAntes: number | null;
  // Unidades que cambiaron SIN registro entre el movimiento anterior y este
  // (+ sobraron, − faltaron). 0 o null = el historial cierra.
  sinRegistro: number | null;
};

const SUMAN = ['entrada', 'devolucion'];
const RESTAN = ['salida', 'venta'];

// Recorre los movimientos de cada producto en orden cronológico y, para cada
// uno, compara el stock con el que quedó el movimiento anterior: si no
// coinciden, algo cambió la cantidad sin pasar por el registro (edición directa,
// importación, base modificada a mano) y justo eso es lo que explica una
// diferencia de unidades. Devuelve el resultado del más nuevo al más viejo.
export function procesarMovimientos(movimientos: MovimientoCrudo[]): MovimientoVista[] {
  const porProducto = new Map<string, MovimientoCrudo[]>();
  for (const m of movimientos) {
    const lista = porProducto.get(m.producto_id) ?? [];
    lista.push(m);
    porProducto.set(m.producto_id, lista);
  }

  const vistas: MovimientoVista[] = [];
  for (const lista of porProducto.values()) {
    const cronologico = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    let anterior: MovimientoCrudo | null = null;
    for (const m of cronologico) {
      let cambio: number | null = null;
      if (SUMAN.includes(m.tipo)) cambio = m.cantidad;
      else if (RESTAN.includes(m.tipo)) cambio = -m.cantidad;
      else if (anterior) {
        // Ajuste: se elige el sentido que mejor cierra con el movimiento
        // anterior; si los dos cierran igual de bien (o de mal), no se adivina.
        const gapSuma = m.cantidad_resultante - m.cantidad - anterior.cantidad_resultante;
        const gapResta = m.cantidad_resultante + m.cantidad - anterior.cantidad_resultante;
        if (Math.abs(gapSuma) < Math.abs(gapResta)) cambio = m.cantidad;
        else if (Math.abs(gapResta) < Math.abs(gapSuma)) cambio = -m.cantidad;
      }
      const stockAntes = cambio != null ? m.cantidad_resultante - cambio : null;
      const sinRegistro = anterior && stockAntes != null ? stockAntes - anterior.cantidad_resultante : null;
      vistas.push({ ...m, cambio, stockAntes, sinRegistro });
      anterior = m;
    }
  }
  return vistas.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export const ETIQUETA_TIPO_MOVIMIENTO: Record<string, string> = {
  venta: 'Venta',
  devolucion: 'Devolución',
  entrada: 'Ingreso de stock',
  salida: 'Salida de stock',
  ajuste: 'Ajuste',
};

export type CambioAuditoria = { campo: string; antes: string; despues: string };

const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  marca: 'Marca',
  categoria: 'Categoría',
  cantidad: 'Cantidad',
  costo: 'Costo',
  precio: 'Precio',
  sku: 'SKU',
  codigo_barras: 'Código de barras',
  garantia_dias: 'Garantía (días)',
  stock_minimo: 'Stock mínimo',
};

const texto = (v: unknown): string => (v == null || v === '' ? '—' : String(v));

// Qué campos cambiaron según el antes/después que dejó la auditoría. Solo
// devuelve los que realmente difieren; si la auditoría no guardó el detalle
// (acciones viejas) devuelve una lista vacía.
export function cambiosDeAuditoria(anterior: unknown, nuevo: unknown): CambioAuditoria[] {
  const a = anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? (anterior as Record<string, unknown>) : null;
  const n = nuevo && typeof nuevo === 'object' && !Array.isArray(nuevo) ? (nuevo as Record<string, unknown>) : null;
  if (!a || !n) return [];
  const claves = Array.from(new Set([...Object.keys(a), ...Object.keys(n)]));
  return claves
    .filter((k) => texto(a[k]) !== texto(n[k]))
    .map((k) => ({ campo: ETIQUETA_CAMPO[k] ?? k, antes: texto(a[k]), despues: texto(n[k]) }));
}
