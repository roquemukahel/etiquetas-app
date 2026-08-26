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

// Monto EXACTO para mostrar: hasta 2 decimales si los tiene (US$7,64 no se
// redondea a 8), pero sin forzar ",00" en los enteros (US$470 queda US$470).
// Este es el criterio que ya usan las boletas (app/ordenes/[id]/boleta,
// app/boleta/[token]) — un cliente reportó (2026-08-26) que el saldo de
// cuenta corriente SÍ redondeaba mientras la boleta no, porque cada
// pantalla tenía su propio `fmt` local con Math.round(). Cualquier pantalla
// que muestre un monto de dinero (no cantidades/porcentajes/días) debería
// usar esto en vez de definir su propio formateador con Math.round().
export function formatearMonto(n: number, locale: string = 'es-AR'): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}
