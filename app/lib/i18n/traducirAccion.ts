// ============================================================
// Traduce (a nivel de LECTURA, nunca de escritura) las frases de
// auditoría más comunes que "Actividad reciente" (app/page.tsx) y la
// pantalla de Auditoría (app/configuracion/auditoria/page.tsx) muestran.
//
// Por qué existe esto en vez de traducir con t() como el resto de la app:
// `auditoria.accion` NO es un texto de interfaz con una clave fija — es
// una oración en español ya armada (con el nombre, el monto, el modelo,
// etc. adentro) que registrarAuditoria() graba tal cual en la base, en
// más de 100 lugares distintos del código. Traducirla al escribirla
// horneraría el idioma de quien hizo la acción en un dato que después
// puede leer cualquiera con otro idioma — el mismo motivo por el que
// `orden.forma_pago` tampoco se traduce al guardar (ver ordenes/nueva).
//
// La solución: reconocer los patrones más frecuentes por expresión
// regular y reconstruir la frase en el idioma de quien la está MIRANDO,
// sin tocar lo que ya está guardado ni los 100+ puntos que lo generan. Lo
// que no matchea ningún patrón se muestra tal cual en español, exactamente
// igual que hoy — nunca es peor que antes, solo mejor cuando reconoce el
// patrón. Es una lista pensada para crecer con el tiempo, no un intento de
// cubrir el 100% de una sola vez.
import type { Idioma } from './traducir';

type Constructor = (m: RegExpMatchArray) => string;

const PATRONES: { re: RegExp; pt: Constructor; en: Constructor }[] = [
  // --- Sucursales ---
  {
    re: /^activó el módulo de sucursales$/,
    pt: () => 'ativou o módulo de filiais',
    en: () => 'activated the branches module',
  },
  {
    re: /^creó la sucursal "(.+)"$/,
    pt: (m) => `criou a filial "${m[1]}"`,
    en: (m) => `created the branch "${m[1]}"`,
  },
  {
    re: /^renombró la sucursal "(.+)" a "(.+)"$/,
    pt: (m) => `renomeou a filial "${m[1]}" para "${m[2]}"`,
    en: (m) => `renamed the branch "${m[1]}" to "${m[2]}"`,
  },
  {
    re: /^archivó la sucursal "(.+)"$/,
    pt: (m) => `arquivou a filial "${m[1]}"`,
    en: (m) => `archived the branch "${m[1]}"`,
  },
  {
    re: /^restauró la sucursal "(.+)"$/,
    pt: (m) => `restaurou a filial "${m[1]}"`,
    en: (m) => `restored the branch "${m[1]}"`,
  },

  // --- Categorías de stock ---
  {
    re: /^creó la categoría de stock "(.+)"$/,
    pt: (m) => `criou a categoria de estoque "${m[1]}"`,
    en: (m) => `created the stock category "${m[1]}"`,
  },
  {
    re: /^renombró la categoría "(.+)" a "(.+)"$/,
    pt: (m) => `renomeou a categoria "${m[1]}" para "${m[2]}"`,
    en: (m) => `renamed the category "${m[1]}" to "${m[2]}"`,
  },
  {
    re: /^archivó la categoría de stock "(.+)"$/,
    pt: (m) => `arquivou a categoria de estoque "${m[1]}"`,
    en: (m) => `archived the stock category "${m[1]}"`,
  },
  {
    re: /^restauró la categoría de stock "(.+)"$/,
    pt: (m) => `restaurou a categoria de estoque "${m[1]}"`,
    en: (m) => `restored the stock category "${m[1]}"`,
  },

  // --- Categorías de egresos ---
  {
    re: /^creó la categoría de egresos "(.+)"$/,
    pt: (m) => `criou a categoria de despesas "${m[1]}"`,
    en: (m) => `created the expense category "${m[1]}"`,
  },
  {
    re: /^renombró la categoría de egresos "(.+)" a "(.+)"$/,
    pt: (m) => `renomeou a categoria de despesas "${m[1]}" para "${m[2]}"`,
    en: (m) => `renamed the expense category "${m[1]}" to "${m[2]}"`,
  },
  {
    re: /^archivó la categoría de egresos "(.+)"$/,
    pt: (m) => `arquivou a categoria de despesas "${m[1]}"`,
    en: (m) => `archived the expense category "${m[1]}"`,
  },
  {
    re: /^restauró la categoría de egresos "(.+)"$/,
    pt: (m) => `restaurou a categoria de despesas "${m[1]}"`,
    en: (m) => `restored the expense category "${m[1]}"`,
  },

  // --- Servicio Técnico ---
  {
    re: /^cambió el estado de la reparación (\S*) \((.+?)\) de "(.+?)" a "(.+?)"(.*)$/,
    pt: (m) => `mudou o status do reparo ${m[1]} (${m[2]}) de "${m[3]}" para "${m[4]}"${m[5]}`,
    en: (m) => `changed the repair status of ${m[1]} (${m[2]}) from "${m[3]}" to "${m[4]}"${m[5]}`,
  },
  {
    re: /^agregó al Stock un equipo propio reparado en Servicio Técnico \((.+)\)$/,
    pt: (m) => `adicionou ao Estoque um aparelho próprio reparado na Assistência Técnica (${m[1]})`,
    en: (m) => `added to Stock a repaired device owned by the shop from Repair Service (${m[1]})`,
  },
  {
    re: /^marcó como entregado al cliente un equipo reparado en Servicio Técnico \((.+)\)$/,
    pt: (m) => `marcou como entregue ao cliente um aparelho reparado na Assistência Técnica (${m[1]})`,
    en: (m) => `marked a repaired device from Repair Service as delivered to the customer (${m[1]})`,
  },
  {
    re: /^eliminó definitivamente una reparación \((.+)\)$/,
    pt: (m) => `excluiu definitivamente um reparo (${m[1]})`,
    en: (m) => `permanently deleted a repair (${m[1]})`,
  },

  // --- Dispositivos (Stock) ---
  {
    re: /^derivó de Stock a Servicio Técnico un dispositivo \((.+)\)$/,
    pt: (m) => `encaminhou do Estoque para a Assistência Técnica um aparelho (${m[1]})`,
    en: (m) => `sent a device from Stock to Repair Service (${m[1]})`,
  },
  {
    re: /^eliminó el dispositivo (.+) del historial$/,
    pt: (m) => `excluiu o aparelho ${m[1]} do histórico`,
    en: (m) => `deleted the device ${m[1]} from history`,
  },
  {
    // El sufijo opcional "(selección múltiple)" es el que aparece en
    // stock/page.tsx cuando la acción viene de marcar varios dispositivos
    // a la vez, en vez de uno solo — sin el grupo 3 acá, ese caso nunca
    // matcheaba (el "$" quedaba pegado justo antes del sufijo) y quedaba
    // siempre en español pese a estar en pt/en.
    re: /^marcó (.+) como (en stock|fuera de stock)( \(selección múltiple\))?$/,
    pt: (m) => `marcou ${m[1]} como ${m[2] === 'en stock' ? 'em estoque' : 'fora de estoque'}${m[3] ? ' (seleção múltipla)' : ''}`,
    en: (m) => `marked ${m[1]} as ${m[2] === 'en stock' ? 'in stock' : 'out of stock'}${m[3] ? ' (multiple selection)' : ''}`,
  },

  // --- Productos/accesorios (Stock) ---
  {
    re: /^eliminó un accesorio del Stock \((.+)\)$/,
    pt: (m) => `excluiu um acessório do Estoque (${m[1]})`,
    en: (m) => `deleted an accessory from Stock (${m[1]})`,
  },
  {
    re: /^editó el accesorio "(.+)"$/,
    pt: (m) => `editou o acessório "${m[1]}"`,
    en: (m) => `edited the accessory "${m[1]}"`,
  },

  // --- Personas / clientes / proveedores ---
  {
    re: /^eliminó un vendedor \((.+)\)$/,
    pt: (m) => `excluiu um vendedor (${m[1]})`,
    en: (m) => `deleted a salesperson (${m[1]})`,
  },
  {
    re: /^eliminó un técnico \((.+)\)$/,
    pt: (m) => `excluiu um técnico (${m[1]})`,
    en: (m) => `deleted a technician (${m[1]})`,
  },
  {
    re: /^eliminó un proveedor \((.+)\)$/,
    pt: (m) => `excluiu um fornecedor (${m[1]})`,
    en: (m) => `deleted a supplier (${m[1]})`,
  },
  {
    re: /^eliminó al cliente (.+)$/,
    pt: (m) => `excluiu o cliente ${m[1]}`,
    en: (m) => `deleted the client ${m[1]}`,
  },

  // --- Órdenes / Plan de ahorro / Remito interno ---
  {
    re: /^eliminó\/canceló una orden \((.+)\)(.*)$/,
    pt: (m) => `excluiu/cancelou um pedido (${m[1]})${m[2]}`,
    en: (m) => `deleted/cancelled an order (${m[1]})${m[2]}`,
  },
  {
    re: /^editó una orden \((.+)\)$/,
    pt: (m) => `editou um pedido (${m[1]})`,
    en: (m) => `edited an order (${m[1]})`,
  },
  {
    re: /^eliminó un plan de ahorro \((.+)\)$/,
    pt: (m) => `excluiu um plano de poupança (${m[1]})`,
    en: (m) => `deleted a savings plan (${m[1]})`,
  },
  {
    re: /^Generó el remito interno (\S+) de (.+) a (.+) con (\d+) ítems?$/,
    pt: (m) => `Gerou a transferência interna ${m[1]} de ${m[2]} para ${m[3]} com ${m[4]} ${m[4] === '1' ? 'item' : 'itens'}`,
    en: (m) => `Generated internal transfer ${m[1]} from ${m[2]} to ${m[3]} with ${m[4]} item${m[4] === '1' ? '' : 's'}`,
  },
];

// idioma 'es' no necesita nada — accion ya está en español, que es
// exactamente lo que se guardó. Para pt/en, se prueba cada patrón en
// orden hasta encontrar uno que matchee; si ninguno matchea, se devuelve
// la frase tal cual (fallback seguro, igual que el t() del resto de la app
// cuando falta una clave).
export function traducirAccion(accion: string, idioma: Idioma): string {
  if (idioma === 'es' || !accion) return accion;
  for (const patron of PATRONES) {
    const m = accion.match(patron.re);
    if (m) return idioma === 'pt' ? patron.pt(m) : patron.en(m);
  }
  return accion;
}
