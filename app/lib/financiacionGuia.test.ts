import { describe, expect, it } from 'vitest';
import { aplicarModoPrecio, excedeGuia, guiaAFormulario, guiaDeFormulario, maximoDeCarrito, mensajeAvisoGuia, resolverMaxCuotas, textoGuia } from './financiacionGuia';

describe('guía de financiación', () => {
  it('el producto manda sobre la categoría, y sin ninguna no hay guía', () => {
    expect(resolverMaxCuotas(6, 3)).toBe(6);
    expect(resolverMaxCuotas(0, 6)).toBe(0); // "sin financiación" también es un valor propio
    expect(resolverMaxCuotas(null, 4)).toBe(4);
    expect(resolverMaxCuotas(undefined, null)).toBeNull();
  });
  it('con varios productos manda el de límite más bajo; sin guía no cuenta', () => {
    expect(maximoDeCarrito([6, 3, 12])).toBe(3);
    expect(maximoDeCarrito([null, 8, undefined])).toBe(8);
    expect(maximoDeCarrito([6, 0])).toBe(0);
    expect(maximoDeCarrito([null, undefined])).toBeNull();
  });
  it('excede cuando se pasan las cuotas; con 0 cualquier financiación excede', () => {
    expect(excedeGuia(6, 6)).toBe(false);
    expect(excedeGuia(7, 6)).toBe(true);
    expect(excedeGuia(1, 0)).toBe(true);
    expect(excedeGuia(12, null)).toBe(false);
  });
  it('textos de la etiqueta y del aviso', () => {
    expect(textoGuia(6)).toBe('💳 Hasta 6 cuotas');
    expect(textoGuia(1)).toBe('💳 Hasta 1 cuota');
    expect(textoGuia(0)).toBe('🚫 Sin financiación');
    expect(textoGuia(null)).toBeNull();
    expect(mensajeAvisoGuia(6, false)).toBe('Este producto financia hasta 6 cuotas.');
    expect(mensajeAvisoGuia(3, true)).toContain('límite más bajo');
    expect(mensajeAvisoGuia(0, false)).toContain('no se financia');
  });
  it('formulario: vacío hereda, 0 es sin financiación', () => {
    expect(guiaDeFormulario('')).toBeNull();
    expect(guiaDeFormulario('0')).toBe(0);
    expect(guiaDeFormulario('6')).toBe(6);
    expect(guiaDeFormulario('abc')).toBeNull();
    expect(guiaAFormulario(null)).toBe('');
    expect(guiaAFormulario(0)).toBe('0');
  });
});

describe('dos precios', () => {
  const item = { precioUnitario: 1000, precioExclusivo: 1000, precioLista: 1300 };
  it('al financiar pasa al precio de lista y al desactivar vuelve al exclusivo', () => {
    const financiado = aplicarModoPrecio([item], true);
    expect(financiado[0].precioUnitario).toBe(1300);
    expect(aplicarModoPrecio(financiado, false)[0].precioUnitario).toBe(1000);
  });
  it('un precio que el vendedor cambió a mano no se pisa', () => {
    const editado = { ...item, precioUnitario: 900 };
    expect(aplicarModoPrecio([editado], true)[0].precioUnitario).toBe(900);
  });
  it('sin precio de lista cargado no cambia nada', () => {
    const sinLista = { precioUnitario: 1000, precioExclusivo: 1000, precioLista: null };
    expect(aplicarModoPrecio([sinLista], true)[0].precioUnitario).toBe(1000);
  });
});
