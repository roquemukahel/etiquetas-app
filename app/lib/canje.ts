import type { SupabaseClient } from '@supabase/supabase-js';
import { asegurarModelo, normalizarNombreModelo } from './modelos';
import { limpiarImei } from './imei';
import { obtenerTodasLasFilas } from './db';

export type CanjeParaStock = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  condicion: string | null;
  monto?: number | null;
};

export const COLUMNAS_CANJE_PARA_STOCK = 'id, modelo, capacidad_gb, color, imei, salud_bateria, detalles, condicion, monto';

// Canjes que todavía están esperando en Plan Canje (no agregados al Stock, no derivados a
// Servicio Técnico). Es la lista donde hay que buscar antes de cargar un equipo a mano.
export async function canjesPendientes(supabase: SupabaseClient): Promise<CanjeParaStock[]> {
  return obtenerTodasLasFilas<CanjeParaStock>(
    supabase,
    'canjes',
    COLUMNAS_CANJE_PARA_STOCK,
    [{ columna: 'created_at', ascending: false }],
    (q) => q.eq('estado', 'en_canje').eq('agregado_a_stock', false).or('oculto_en_canje.is.null,oculto_en_canje.eq.false')
  );
}

// De los canjes pendientes, los que pueden ser el equipo que se está cargando a mano:
//  - 'imei': el IMEI tipeado (completo o a medio escribir) es el comienzo del IMEI de un canje.
//  - 'modelo': mismo modelo y no se puede descartar por IMEI (no se tipeó IMEI todavía, o el
//    canje no tiene). Si el IMEI tipeado es distinto al del canje, son equipos distintos.
export function canjesCoincidentes(
  pendientes: CanjeParaStock[],
  imei: string,
  modelo: string
): { porImei: CanjeParaStock[]; porModelo: CanjeParaStock[] } {
  return coincidenciasPorImeiOModelo(pendientes, imei, modelo);
}

// Misma regla para cualquier lista de equipos (canjes, equipos en Standby...): ver el comentario de arriba.
export function coincidenciasPorImeiOModelo<T extends { imei: string | null; modelo: string | null }>(
  pendientes: T[],
  imei: string,
  modelo: string
): { porImei: T[]; porModelo: T[] } {
  const imeiTipeado = limpiarImei(imei) ?? '';
  // Los modelos de un canje se escriben a mano ("iPhone 6 s Plus"): se comparan sin espacios ni mayúsculas.
  const comparable = (m: string) => normalizarNombreModelo(m.trim()).toLowerCase().replace(/\s+/g, '');
  const modeloNorm = modelo.trim() ? comparable(modelo) : '';
  const porImei: T[] = [];
  const porModelo: T[] = [];
  for (const c of pendientes) {
    const imeiCanje = limpiarImei(c.imei ?? '') ?? '';
    // Mientras se va tipeando, alcanza con que lo escrito sea el comienzo del IMEI del canje: el aviso
    // aparece desde el segundo dígito y se va recién cuando algún dígito deja de coincidir.
    if (imeiTipeado.length >= 2 && imeiCanje.startsWith(imeiTipeado)) {
      porImei.push(c);
      continue;
    }
    if (!modeloNorm || !c.modelo) continue;
    if (comparable(c.modelo) !== modeloNorm) continue;
    if (imeiTipeado && imeiCanje) continue; // los dos tienen IMEI y no coinciden: otro equipo
    porModelo.push(c);
  }
  return { porImei, porModelo };
}

// ¿Alguno de los canjes tiene EXACTAMENTE el IMEI tipeado? (el aviso salta con el IMEI a medio escribir,
// pero la confirmación al guardar solo corresponde cuando el IMEI ya está completo y es el mismo).
export function hayCanjeConEseImei(canjes: { imei: string | null }[], imei: string): boolean {
  const tipeado = limpiarImei(imei);
  return !!tipeado && canjes.some((c) => limpiarImei(c.imei) === tipeado);
}

// Pasa un canje de Plan Canje al Stock. Primero reserva el canje (solo si seguía sin agregar,
// condición evaluada en la base) y recién después crea el dispositivo, así el mismo canje no
// se duplica si se procesa desde dos pestañas. Si crear el dispositivo falla, devuelve el
// canje a Plan Canje. Con `standby` el equipo no entra al Stock vendible sino a Standby (con ese motivo).
export async function agregarCanjeAlStock(
  supabase: SupabaseClient,
  c: CanjeParaStock,
  opciones: { sucursalId: string | null; actor: { nombre?: string | null; fotoUrl?: string | null } | null; standby?: { motivo: string } }
): Promise<{ ok: true } | { ok: false; yaAgregado: boolean; mensaje: string }> {
  const { data: actualizado, error: estadoErr } = await supabase
    .from('canjes')
    .update({ agregado_a_stock: true })
    .eq('id', c.id)
    .eq('agregado_a_stock', false)
    .select('id');
  if (estadoErr) return { ok: false, yaAgregado: false, mensaje: estadoErr.message };
  if (!actualizado || actualizado.length === 0) return { ok: false, yaAgregado: true, mensaje: '' };

  const modeloNormalizado = c.modelo ? normalizarNombreModelo(c.modelo) : c.modelo;
  const { error: insertError } = await supabase.from('dispositivos').insert({
    modelo: modeloNormalizado,
    capacidad_gb: c.capacidad_gb,
    color: c.color,
    imei: c.imei,
    salud_bateria: c.salud_bateria,
    estado: c.condicion || 'usado',
    detalles: c.detalles,
    // Lo que se le reconoció al cliente por el equipo es lo que le costó al negocio: sin esto el equipo entraba sin costo y
    // sus ventas futuras figuraban como ganancia completa (o quedaban "sin costo" fuera de los márgenes).
    ...(c.monto && c.monto > 0 ? { costo: c.monto } : {}),
    ...(opciones.standby
      ? {
          en_stock: false,
          en_espera: true,
          en_espera_desde: new Date().toISOString(),
          espera_origen: 'canje',
          espera_motivo: opciones.standby.motivo.trim() || null,
        }
      : { en_stock: true }),
    agregado_por_nombre: opciones.actor?.nombre ?? null,
    agregado_por_foto_url: opciones.actor?.fotoUrl ?? null,
    ...(opciones.sucursalId ? { sucursal_id: opciones.sucursalId } : {}),
  });
  if (insertError) {
    const { error: deshacerError } = await supabase.from('canjes').update({ agregado_a_stock: false }).eq('id', c.id);
    return {
      ok: false,
      yaAgregado: false,
      mensaje: insertError.message + (deshacerError ? ` (${deshacerError.message})` : ''),
    };
  }
  await asegurarModelo(supabase, modeloNormalizado);
  return { ok: true };
}
