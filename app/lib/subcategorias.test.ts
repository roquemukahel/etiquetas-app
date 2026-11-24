import { describe, expect, it } from 'vitest';
import { categoriasRaiz, esSubcategoria, etiquetaCategoria, opcionesDeCategoria, subcategoriasDe, ubicarCategoria } from './subcategorias';

const cats = [
  { id: 'cel', nombre: 'Celulares' },
  { id: 'acc', nombre: 'ACC PARA CELULARES' },
  { id: 'cab', nombre: 'Cables', padre_id: 'acc' },
  { id: 'car', nombre: 'Cargadores', padre_id: 'acc' },
  { id: 'fun', nombre: 'Fundas', padre_id: 'acc' },
];

describe('subcategorías de stock', () => {
  it('separa las de primer nivel de las subcategorías', () => {
    expect(categoriasRaiz(cats).map((c) => c.id)).toEqual(['cel', 'acc']);
    expect(subcategoriasDe(cats, 'acc').map((c) => c.nombre)).toEqual(['Cables', 'Cargadores', 'Fundas']);
    expect(subcategoriasDe(cats, 'cel')).toEqual([]);
    expect(esSubcategoria(cats[2])).toBe(true);
    expect(esSubcategoria(cats[0])).toBe(false);
  });
  it('arma la etiqueta con la categoría de arriba', () => {
    expect(etiquetaCategoria('cab', cats)).toBe('ACC PARA CELULARES › Cables');
    expect(etiquetaCategoria('acc', cats)).toBe('ACC PARA CELULARES');
    expect(etiquetaCategoria(null, cats)).toBe('');
    expect(etiquetaCategoria('no-existe', cats)).toBe('');
  });
  it('las opciones de un selector van agrupadas: categoría y debajo sus subcategorías', () => {
    expect(opcionesDeCategoria(cats).map((o) => o.etiqueta)).toEqual([
      'Celulares',
      'ACC PARA CELULARES',
      'ACC PARA CELULARES › Cables',
      'ACC PARA CELULARES › Cargadores',
      'ACC PARA CELULARES › Fundas',
    ]);
    expect(opcionesDeCategoria(cats).filter((o) => o.esSub)).toHaveLength(3);
  });
  it('una subcategoría cuyo padre se archivó igual se ofrece (no esconde lo ya asignado)', () => {
    const sinPadre = cats.filter((c) => c.id !== 'acc');
    expect(opcionesDeCategoria(sinPadre).map((o) => o.id)).toEqual(['cel', 'cab', 'car', 'fun']);
  });
  it('ubica un producto: en la categoría de arriba y en su subcategoría', () => {
    expect(ubicarCategoria('fun', cats)).toEqual({ categoria: cats[1], subcategoria: cats[4] });
    expect(ubicarCategoria('acc', cats)).toEqual({ categoria: cats[1], subcategoria: null });
    expect(ubicarCategoria(null, cats)).toEqual({ categoria: null, subcategoria: null });
    expect(ubicarCategoria('borrada', cats)).toEqual({ categoria: null, subcategoria: null });
  });
  it('una subcategoría sin su padre se trata como categoría propia', () => {
    const sinPadre = cats.filter((c) => c.id !== 'acc');
    expect(ubicarCategoria('cab', sinPadre)).toEqual({ categoria: sinPadre[1], subcategoria: null });
  });
});
