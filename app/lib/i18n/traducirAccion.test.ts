import { describe, expect, it } from 'vitest';
import { traducirAccion } from './traducirAccion';

describe('traducirAccion: frases de auditoría nuevas', () => {
  const casos: [string, string, string][] = [
    ['creó la subcategoría "Cables" dentro de "ACC"', 'created the subcategory "Cables" inside "ACC"', 'criou a subcategoria "Cables" dentro de "ACC"'],
    ['renombró la subcategoría "Cables" a "Cables USB"', 'renamed the subcategory "Cables" to "Cables USB"', 'renomeou a subcategoria "Cables" para "Cables USB"'],
    ['asignó la categoría "ACC › Cables" a 12 productos', 'assigned the category "ACC › Cables" to 12 products', 'atribuiu a categoria "ACC › Cables" a 12 produtos'],
    ['asignó la categoría "Sin categoría" a 3 productos', 'assigned the category "No category" to 3 products', 'atribuiu a categoria "Sem categoria" a 3 produtos'],
    ['asignó la sucursal "Estación Aráoz" a 40 clientes', 'assigned the branch "Estación Aráoz" to 40 customers', 'atribuiu a filial "Estación Aráoz" a 40 clientes'],
    ['actualizó el cronograma de cobro por terminación de DNI', 'updated the collection schedule by ID ending', 'atualizou o cronograma de cobrança por final do DNI'],
    ['unificó 5 localidades escritas de distintas formas', 'merged 5 localities written in different ways', 'unificou 5 localidades escritas de formas diferentes'],
    ['agregó la localidad "Las Cejas"', 'added the locality "Las Cejas"', 'adicionou a localidade "Las Cejas"'],
    ['quitó la localidad "Los Ralos" de la lista', 'removed the locality "Los Ralos" from the list', 'removeu a localidade "Los Ralos" da lista'],
    ['marcó como revisado el cierre N° 12 de Caja principal', 'marked as reviewed closing no. 12 of Caja principal', 'marcou como conferido o fechamento N° 12 de Caja principal'],
    ['quitó la marca de revisado de el cierre N° 12 de Caja principal', 'removed the reviewed mark from closing no. 12 of Caja principal', 'removeu a marca de conferido de o fechamento N° 12 de Caja principal'],
  ];
  for (const [es, en, pt] of casos) {
    it(es, () => {
      expect(traducirAccion(es, 'en')).toBe(en);
      expect(traducirAccion(es, 'pt')).toBe(pt);
      expect(traducirAccion(es, 'es')).toBe(es);
    });
  }
});
