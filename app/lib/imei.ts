// El IMEI en la pantalla "Información" del iPhone aparece agrupado con
// espacios (ej. "35 328511 123456 7"), tanto leído por foto como si alguien
// lo tipea a mano copiándolo tal cual. Lo guardamos siempre sin espacios.
export function limpiarImei(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/\s+/g, '');
  return limpio || null;
}
