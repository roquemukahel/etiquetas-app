// Subcategorías de stock (subcategorias_supabase.sql): una categoría puede colgar de otra (un solo nivel). Un producto o equipo guarda
// en categoria_id la categoría O la subcategoría en la que cae; la categoría "de arriba" se deduce.

export type CategoriaArbol = { id: string; nombre: string; padre_id?: string | null };

export const SEPARADOR_SUBCATEGORIA = ' › ';

export function esSubcategoria(c: CategoriaArbol | undefined | null): boolean {
  return !!c?.padre_id;
}

// Las de primer nivel, en el orden recibido.
export function categoriasRaiz<T extends CategoriaArbol>(categorias: T[]): T[] {
  return categorias.filter((c) => !c.padre_id);
}

export function subcategoriasDe<T extends CategoriaArbol>(categorias: T[], padreId: string): T[] {
  return categorias.filter((c) => c.padre_id === padreId);
}

// "Accesorios › Cables" para una subcategoría, "Accesorios" para una de primer nivel.
export function etiquetaCategoria(id: string | null | undefined, categorias: CategoriaArbol[]): string {
  if (!id) return '';
  const c = categorias.find((x) => x.id === id);
  if (!c) return '';
  const padre = c.padre_id ? categorias.find((x) => x.id === c.padre_id) : undefined;
  return padre ? `${padre.nombre}${SEPARADOR_SUBCATEGORIA}${c.nombre}` : c.nombre;
}

// Para un <select>: cada categoría seguida de sus subcategorías (con la etiqueta completa). Una subcategoría cuyo padre no está en la
// lista (archivado) igual se ofrece, sola, para no esconder lo que ya tiene asignado.
export function opcionesDeCategoria<T extends CategoriaArbol>(categorias: T[]): { id: string; etiqueta: string; esSub: boolean }[] {
  const ids = new Set(categorias.map((c) => c.id));
  const opciones: { id: string; etiqueta: string; esSub: boolean }[] = [];
  for (const raiz of categorias.filter((c) => !c.padre_id)) {
    opciones.push({ id: raiz.id, etiqueta: raiz.nombre, esSub: false });
    for (const sub of subcategoriasDe(categorias, raiz.id)) opciones.push({ id: sub.id, etiqueta: etiquetaCategoria(sub.id, categorias), esSub: true });
  }
  for (const huerfana of categorias.filter((c) => c.padre_id && !ids.has(c.padre_id))) {
    opciones.push({ id: huerfana.id, etiqueta: huerfana.nombre, esSub: true });
  }
  return opciones;
}

// Dónde cae algo que tiene `categoriaId` asignado: la categoría de arriba y, si es una subcategoría, ella.
export function ubicarCategoria(
  categoriaId: string | null | undefined,
  categorias: CategoriaArbol[]
): { categoria: CategoriaArbol | null; subcategoria: CategoriaArbol | null } {
  if (!categoriaId) return { categoria: null, subcategoria: null };
  const c = categorias.find((x) => x.id === categoriaId);
  if (!c) return { categoria: null, subcategoria: null };
  if (!c.padre_id) return { categoria: c, subcategoria: null };
  const padre = categorias.find((x) => x.id === c.padre_id) ?? null;
  // Si el padre ya no existe, la subcategoría se muestra como categoría propia.
  return padre ? { categoria: padre, subcategoria: c } : { categoria: c, subcategoria: null };
}
