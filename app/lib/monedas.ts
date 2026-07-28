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
];

export function simboloMoneda(codigo: string | null | undefined) {
  return MONEDAS.find((m) => m.codigo === codigo)?.simbolo ?? '$';
}
