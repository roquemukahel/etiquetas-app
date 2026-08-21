export const MONEDAS = [
  { codigo: 'ARS', nombre: 'Peso argentino', simbolo: '$' },
  { codigo: 'USD', nombre: 'Dólar estadounidense', simbolo: 'US$' },
  { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  { codigo: 'PYG', nombre: 'Guaraní paraguayo', simbolo: '₲' },
  { codigo: 'UYU', nombre: 'Peso uruguayo', simbolo: '$U' },
  { codigo: 'CLP', nombre: 'Peso chileno', simbolo: 'CLP$' },
  { codigo: 'BRL', nombre: 'Real brasileño', simbolo: 'R$' },
  { codigo: 'MXN', nombre: 'Peso mexicano', simbolo: 'MX$' },
  { codigo: 'COP', nombre: 'Peso colombiano', simbolo: 'COL$' },
  { codigo: 'BOB', nombre: 'Boliviano', simbolo: 'Bs' },
  { codigo: 'PEN', nombre: 'Sol peruano', simbolo: 'S/' },
  { codigo: 'VES', nombre: 'Bolívar venezolano', simbolo: 'Bs.S' },
];

export function simboloMoneda(codigo: string | null | undefined) {
  return MONEDAS.find((m) => m.codigo === codigo)?.simbolo ?? '$';
}

// Cuántos decimales usar en cálculos de dinero según la moneda — las que en
// la práctica no se manejan con centavos (pesos con mucha inflación, etc.)
// van sin decimales, el resto con 2. Usado por cualquier motor de cálculo
// que necesite redondear (ver app/lib/financiacion/motor.ts).
export function decimalesMoneda(codigo: string | null | undefined): number {
  const sinDecimales = ['ARS', 'CLP', 'COP', 'PYG', 'VES'];
  if (codigo && sinDecimales.includes(codigo.toUpperCase())) return 0;
  return 2;
}
