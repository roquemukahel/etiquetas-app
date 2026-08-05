// Deja solo dígitos y UN separador decimal, aceptando punto o coma (la coma
// se pasa a punto). Pensado para aplicarse en el onChange de inputs de
// precio/monto: así el estado siempre queda con "." como decimal y un
// posterior Number() nunca da NaN (ej. "1500,50" -> "1500.50"). Sin esto,
// alguien que escribe con coma perdería el dato en silencio al guardar.
export function sanitizarDecimal(s: string): string {
  let v = s.replace(',', '.').replace(/[^\d.]/g, '');
  const i = v.indexOf('.');
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  return v;
}
