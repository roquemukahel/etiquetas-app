// Salud de batería de un equipo (porcentaje entero de 1 a 100).

// Para el campo de texto: solo dígitos, hasta 3, y nunca más de 100.
export function soloPorcentajeBateria(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 3);
  if (digitos === '') return '';
  return String(Math.min(100, Number(digitos)));
}

// Lo que se guarda: un entero de 1 a 100, o null si el campo está vacío o no es un porcentaje válido.
export function parsearBateria(texto: string | null | undefined): number | null {
  const limpio = (texto ?? '').trim();
  if (!/^\d{1,3}$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 1 && n <= 100 ? n : null;
}

// Antes de que existiera el campo, la batería se escribía en los "detalles" ("batería al 70%", "87% de batería", "salud 91%").
// Esto la rescata de ese texto para que al pasar la compra al Stock no se pierda. Es conservador a propósito: solo toma un
// número de 2 o 3 cifras pegado a la palabra batería/salud/bat, y descarta lo que no sea un porcentaje posible (ej. "batería
// cambiada en 2024" o "batería al 120%"). Si no está claro, devuelve null y el equipo entra sin porcentaje.
const PATRONES_BATERIA = [
  /bater[ií]a[^0-9\n]{0,20}?(\d{2,3})(?!\d)/i,
  /(\d{2,3})\s*%\s*(?:de\s+)?(?:la\s+)?(?:salud\s+(?:de\s+)?)?bater[ií]a/i,
  /\bsalud[^0-9\n]{0,12}?(\d{2,3})(?!\d)/i,
  /\bbat\.?\s*(?:al\s+)?(\d{2,3})(?!\d)/i,
];

export function extraerBateriaDeDetalles(detalles: string | null | undefined): number | null {
  const texto = detalles ?? '';
  for (const patron of PATRONES_BATERIA) {
    const coincidencia = texto.match(patron);
    if (coincidencia) {
      const n = parsearBateria(coincidencia[1]);
      if (n != null) return n;
    }
  }
  return null;
}
