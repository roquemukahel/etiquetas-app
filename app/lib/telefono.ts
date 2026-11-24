// En el alta rápida de cliente (durante una orden/compra/plan de ahorro) el
// cajero a veces empieza a tipear el teléfono, se distrae, y termina
// guardando solo el código de área (ej. "381"). Como después nadie puede
// encontrar a ese cliente buscando por su número real, se termina creando
// una ficha duplicada. Tratamos como "incompleto" cualquier teléfono con
// muy pocos dígitos en vez de bloquear por un formato exacto, porque el
// número de abonado varía de país en país.
const MIN_DIGITOS_TELEFONO = 6;

export function telefonoIncompleto(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '');
  return digitos.length > 0 && digitos.length < MIN_DIGITOS_TELEFONO;
}
