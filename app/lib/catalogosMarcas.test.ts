import { describe, expect, it } from 'vitest';
import { compararModelosPorSalida, rangoDeModelo } from './catalogosMarcas';

const ordenar = (nombres: string[]) => [...nombres].sort(compararModelosPorSalida);

describe('orden de las carpetas de modelos', () => {
  it('el iPhone 16e va antes que el 16, y el 17e antes que el 17', () => {
    const r = ordenar(['iPhone 17 Pro Max', 'iPhone 16 Pro', 'iPhone 17e', 'iPhone 16', 'iPhone 17', 'iPhone 16e', 'iPhone 15 Pro Max']);
    expect(r).toEqual(['iPhone 15 Pro Max', 'iPhone 16e', 'iPhone 16', 'iPhone 16 Pro', 'iPhone 17e', 'iPhone 17', 'iPhone 17 Pro Max']);
  });

  it('no importa cómo esté escrita la carpeta: espacios de más, mayúsculas o "Apple" delante', () => {
    for (const variante of ['iPhone 16e', 'iPhone 16E', 'iphone16e', 'iPhone 16 e', ' iPhone  16e ', 'Apple iPhone 16e']) {
      expect(compararModelosPorSalida(variante, 'iPhone 16'), variante).toBeLessThan(0);
      expect(rangoDeModelo(variante), variante).toBe(rangoDeModelo('iPhone 16e'));
    }
    for (const variante of ['iPhone 17e', 'IPHONE 17E', 'iPhone 17 e']) {
      expect(compararModelosPorSalida(variante, 'iPhone 17'), variante).toBeLessThan(0);
    }
  });

  it('lo que no es un modelo del catálogo va al final, alfabético', () => {
    expect(ordenar(['Televisores', 'iPhone 16e', 'Auriculares', 'iPhone 16'])).toEqual(['iPhone 16e', 'iPhone 16', 'Auriculares', 'Televisores']);
  });
});
