// Standby: zona para los equipos con defectos o en espera, que no se quieren mezclar con el Stock vendible ni dejar
// ocupando lugar en Servicio Técnico. Un equipo en Standby sigue siendo una fila de `dispositivos` (conserva IMEI,
// fotos reales, precio e historial) con `en_stock = false` y `en_espera = true` (ver standby_supabase.sql).
import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarAuditoria } from './auditoria';
import { normalizarNombreModelo, asegurarModelo } from './modelos';
import { compararModelosPorSalida } from './catalogosMarcas';
import { camposRecibidoPor, registrarRecepcionEnHistorial } from './recibidoPor';
import { soportaMigracion } from './migraciones';
import { obtenerTodasLasFilas } from './db';

export type OrigenStandby = 'stock' | 'canje' | 'servicio_tecnico' | 'manual';

export const ETIQUETA_ORIGEN_STANDBY: Record<OrigenStandby, string> = {
  stock: 'Stock',
  canje: 'Plan Canje',
  servicio_tecnico: 'Servicio Técnico',
  manual: 'Cargado a mano',
};

export type EquipoStandby = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  numero_serie: string | null;
  salud_bateria: number | null;
  precio: number | null;
  costo: number | null;
  estado: string | null;
  detalles: string | null;
  en_espera_desde: string | null;
  espera_origen: OrigenStandby | null;
  espera_motivo: string | null;
  sucursal_id: string | null;
  created_at: string;
};

export const COLUMNAS_STANDBY =
  'id, modelo, capacidad_gb, color, imei, numero_serie, salud_bateria, precio, costo, estado, detalles, en_espera_desde, espera_origen, espera_motivo, sucursal_id, created_at';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Todo en minúscula, sin acentos ni espacios repetidos: "iphone 13" encuentra "iPhone 13 Pro" y "Rojo" a "rojo".
function normalizarBusqueda(s: string): string {
  return sinAcentos(s).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

// El buscador del Standby: cada palabra tipeada tiene que aparecer en algún dato del equipo (modelo, capacidad,
// color, IMEI, serie, motivo, detalles u origen). "13 negro 128" encuentra un iPhone 13 negro de 128 GB.
export function buscarEnStandby(equipos: EquipoStandby[], texto: string): EquipoStandby[] {
  const palabras = normalizarBusqueda(texto).split(' ').filter(Boolean);
  if (palabras.length === 0) return equipos;
  return equipos.filter((e) => {
    const pajar = normalizarBusqueda(
      [
        e.modelo,
        e.capacidad_gb != null ? `${e.capacidad_gb}gb ${e.capacidad_gb}` : null,
        e.color,
        e.imei,
        e.numero_serie,
        e.espera_motivo,
        e.detalles,
        e.espera_origen ? ETIQUETA_ORIGEN_STANDBY[e.espera_origen] : null,
      ]
        .filter(Boolean)
        .join(' ')
    );
    return palabras.every((p) => pajar.includes(p));
  });
}

// Orden de la lista: el que lleva más tiempo esperando primero (es el que más conviene resolver).
export function ordenarStandby(equipos: EquipoStandby[]): EquipoStandby[] {
  return [...equipos].sort((a, b) => {
    const da = a.en_espera_desde ?? a.created_at;
    const db = b.en_espera_desde ?? b.created_at;
    if (da !== db) return da < db ? -1 : 1;
    return compararModelosPorSalida(a.modelo ?? '', b.modelo ?? '');
  });
}

export function diasEnStandby(desde: string | null, ahora: Date = new Date()): number {
  if (!desde) return 0;
  const ms = ahora.getTime() - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

type Resultado = { error: string | null };

// Campo que une una orden de Servicio Técnico con el equipo del que salió (standby_vinculo_servicio_supabase.sql).
// Sin esa migración no se agrega nada y todo funciona como antes.
export async function campoOrigenServicio(supabase: SupabaseClient, dispositivoId: string): Promise<{ dispositivo_origen_id?: string }> {
  return (await soportaMigracion(supabase, 'standbyVinculo')) ? { dispositivo_origen_id: dispositivoId } : {};
}

// Equipo del que salió una orden de Servicio Técnico (null si no hay vínculo o no corrió la migración).
export async function dispositivoOrigenDe(supabase: SupabaseClient, reparacionId: string): Promise<string | null> {
  if (!(await soportaMigracion(supabase, 'standbyVinculo'))) return null;
  const { data, error } = await supabase.from('reparaciones').select('dispositivo_origen_id').eq('id', reparacionId).maybeSingle();
  if (error) return null;
  return (data as { dispositivo_origen_id: string | null } | null)?.dispositivo_origen_id ?? null;
}

// Cuando una reparación propia termina, si salió de un equipo que ya existe (y sigue sin estar ni en Stock ni en
// Standby) se reutiliza ese mismo equipo en vez de crear uno duplicado. `usado: false` = no había a quién reutilizar.
export async function reubicarEquipoDeServicio(
  supabase: SupabaseClient,
  reparacionId: string,
  destino: 'stock' | { standby: string }
): Promise<{ usado: boolean; error: string | null }> {
  const origenId = await dispositivoOrigenDe(supabase, reparacionId);
  if (!origenId) return { usado: false, error: null };
  const ahora = new Date().toISOString();
  const cambios =
    destino === 'stock'
      ? { en_stock: true, en_espera: false, en_stock_desde: ahora, alerta_stock_enviada: false }
      : { en_stock: false, en_espera: true, en_espera_desde: ahora, espera_origen: 'servicio_tecnico', espera_motivo: destino.standby.trim() || null };
  const { data, error } = await supabase
    .from('dispositivos')
    .update(cambios)
    .eq('id', origenId)
    .eq('en_stock', false)
    .eq('en_espera', false)
    .select('id, modelo, imei');
  if (error) return { usado: false, error: error.message };
  if (!data || data.length === 0) return { usado: false, error: null };
  const e = data[0] as { id: string; modelo: string | null; imei: string | null };
  await registrarAuditoria(supabase, {
    accion: destino === 'stock' ? `devolvió ${descripcion(e)} de Servicio Técnico al Stock` : `mandó ${descripcion(e)} de Servicio Técnico a Standby`,
    entidad: 'dispositivo',
    entidadId: e.id,
  });
  return { usado: true, error: null };
}

function descripcion(e: { modelo: string | null; imei: string | null }): string {
  return `${e.modelo || 'un equipo'}${e.imei ? ` (IMEI ${e.imei})` : ''}`;
}

// Saca un equipo del Stock (o de donde esté) y lo deja en Standby, con el motivo que se escribió.
export async function mandarAStandby(
  supabase: SupabaseClient,
  d: { id: string; modelo: string | null; imei: string | null },
  opciones: { origen: OrigenStandby; motivo: string }
): Promise<Resultado> {
  const { error } = await supabase
    .from('dispositivos')
    .update({
      en_stock: false,
      en_espera: true,
      en_espera_desde: new Date().toISOString(),
      espera_origen: opciones.origen,
      espera_motivo: opciones.motivo.trim() || null,
    })
    .eq('id', d.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `mandó ${descripcion(d)} a Standby${opciones.motivo.trim() ? ` (${opciones.motivo.trim()})` : ''}`,
    entidad: 'dispositivo',
    entidadId: d.id,
  });
  return { error: null };
}

// Vuelve al Stock vendible (por ejemplo, porque se arregló). Empieza de nuevo la cuenta de días en Stock.
export async function volverAlStock(supabase: SupabaseClient, d: { id: string; modelo: string | null; imei: string | null }): Promise<Resultado> {
  const { error } = await supabase
    .from('dispositivos')
    .update({
      en_stock: true,
      en_espera: false,
      en_stock_desde: new Date().toISOString(),
      alerta_stock_enviada: false,
    })
    .eq('id', d.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `devolvió ${descripcion(d)} de Standby al Stock`,
    entidad: 'dispositivo',
    entidadId: d.id,
  });
  return { error: null };
}

// Carga un equipo nuevo directo en Standby (por ejemplo, uno que llegó roto y todavía no se sabe qué hacer).
export async function crearEquipoEnStandby(
  supabase: SupabaseClient,
  datos: {
    modelo: string;
    capacidadGb: number | null;
    color: string;
    imei: string;
    motivo: string;
    sucursalId: string | null;
    actor: { nombre?: string | null; fotoUrl?: string | null } | null;
  }
): Promise<Resultado> {
  const modelo = normalizarNombreModelo(datos.modelo.trim());
  const { data, error } = await supabase
    .from('dispositivos')
    .insert({
      modelo,
      capacidad_gb: datos.capacidadGb,
      color: datos.color.trim() || null,
      imei: datos.imei.trim() || null,
      estado: 'usado',
      en_stock: false,
      en_espera: true,
      en_espera_desde: new Date().toISOString(),
      espera_origen: 'manual',
      espera_motivo: datos.motivo.trim() || null,
      agregado_por_nombre: datos.actor?.nombre ?? null,
      agregado_por_foto_url: datos.actor?.fotoUrl ?? null,
      ...(datos.sucursalId ? { sucursal_id: datos.sucursalId } : {}),
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'error desconocido' };
  await asegurarModelo(supabase, modelo);
  await registrarAuditoria(supabase, {
    accion: `cargó ${descripcion({ modelo, imei: datos.imei.trim() || null })} directo en Standby`,
    entidad: 'dispositivo',
    entidadId: (data as { id: string }).id,
  });
  return { error: null };
}

// Del Standby a Servicio Técnico: crea la orden de reparación (igual que "Derivar a Servicio Técnico" de Stock) y
// el equipo deja de estar en espera. Si falla crear la reparación no se toca el equipo, para no dejarlo "perdido".
export async function derivarStandbyAServicio(supabase: SupabaseClient, d: EquipoStandby): Promise<Resultado & { numeroOrden?: string | null }> {
  const { data: nueva, error: insertError } = await supabase
    .from('reparaciones')
    .insert({
      modelo: d.modelo,
      capacidad_gb: d.capacidad_gb,
      color: d.color,
      imei: d.imei,
      estado: 'recibido',
      ...(d.espera_motivo ? { falla_declarada: d.espera_motivo } : {}),
      ...(await campoOrigenServicio(supabase, d.id)),
      ...(await camposRecibidoPor(supabase)),
      ...(d.sucursal_id ? { sucursal_id: d.sucursal_id } : {}),
    })
    .select('id, numero_orden')
    .single();
  if (insertError || !nueva) return { error: insertError?.message ?? 'error desconocido' };
  const { error: updateError } = await supabase.from('dispositivos').update({ en_espera: false, en_stock: false }).eq('id', d.id);
  await registrarRecepcionEnHistorial(supabase, [nueva.id]);
  await registrarAuditoria(supabase, {
    accion: `derivó de Standby a Servicio Técnico un equipo (${nueva.numero_orden || ''}, ${descripcion(d)})`,
    entidad: 'reparacion',
    entidadId: nueva.id,
  });
  if (updateError) return { error: `Se creó la reparación pero no pudimos sacar el equipo de Standby: ${updateError.message}` };
  return { error: null, numeroOrden: nueva.numero_orden };
}

// De Servicio Técnico a Standby: un equipo propio que se revisó pero no se va a arreglar por ahora. Queda como
// equipo en Standby (con lo diagnosticado como motivo) y la reparación se cierra como "agregada" para que deje de
// ocupar lugar en Servicio Técnico.
export async function mandarReparacionAStandby(
  supabase: SupabaseClient,
  r: { id: string; numero_orden?: string | null; modelo: string | null; capacidad_gb: number | null; color: string | null; imei: string | null; sucursal_id?: string | null; fecha_reparado?: string | null },
  opciones: { motivo: string; actor: { nombre?: string | null; fotoUrl?: string | null } | null }
): Promise<Resultado> {
  const modelo = r.modelo ? normalizarNombreModelo(r.modelo) : r.modelo;
  // Si la reparación salió de un equipo que ya existe, vuelve a Standby ese mismo equipo (sin duplicarlo).
  const reutilizado = await reubicarEquipoDeServicio(supabase, r.id, { standby: opciones.motivo });
  if (reutilizado.error) return { error: reutilizado.error };
  if (!reutilizado.usado) {
    const { data, error } = await supabase
      .from('dispositivos')
      .insert({
        modelo,
        capacidad_gb: r.capacidad_gb,
        color: r.color,
        imei: r.imei,
        estado: 'usado',
        en_stock: false,
        en_espera: true,
        en_espera_desde: new Date().toISOString(),
        espera_origen: 'servicio_tecnico',
        espera_motivo: opciones.motivo.trim() || null,
        agregado_por_nombre: opciones.actor?.nombre ?? null,
        agregado_por_foto_url: opciones.actor?.fotoUrl ?? null,
        ...(r.sucursal_id ? { sucursal_id: r.sucursal_id } : {}),
      })
      .select('id')
      .single();
    if (error || !data) return { error: error?.message ?? 'error desconocido' };
    await asegurarModelo(supabase, modelo);
  }
  const { error: errorReparacion } = await supabase
    .from('reparaciones')
    .update({
      estado: 'entregado',
      estado_actualizado_at: new Date().toISOString(),
      agregado_a_stock: true,
      fecha_reparado: r.fecha_reparado ?? new Date().toISOString(),
    })
    .eq('id', r.id);
  await registrarAuditoria(supabase, {
    accion: `mandó a Standby un equipo propio de Servicio Técnico (${r.numero_orden || ''}, ${descripcion({ modelo: r.modelo, imei: r.imei })})`,
    entidad: 'reparacion',
    entidadId: r.id,
  });
  if (errorReparacion) return { error: `El equipo quedó en Standby pero no pudimos cerrar la reparación: ${errorReparacion.message}` };
  return { error: null };
}

// Todos los equipos que están en Standby (vacío si el negocio todavía no corrió standby_supabase.sql).
export async function equiposEnStandby(supabase: SupabaseClient): Promise<EquipoStandby[]> {
  if (!(await soportaMigracion(supabase, 'standby'))) return [];
  return obtenerTodasLasFilas<EquipoStandby>(supabase, 'dispositivos', COLUMNAS_STANDBY, [{ columna: 'created_at', ascending: false }], (q) =>
    q.eq('en_espera', true)
  );
}

// Un equipo señado desde Standby sigue en Standby hasta que se entrega: al entregarlo tiene que pasar por el Stock
// (es lo que usa la venta). Si no está en Standby (o no hay migración) no hace nada.
export async function sacarDeStandbyParaEntregar(supabase: SupabaseClient, dispositivoId: string): Promise<Resultado> {
  if (!(await soportaMigracion(supabase, 'standby'))) return { error: null };
  const { data, error } = await supabase
    .from('dispositivos')
    .update({ en_stock: true, en_espera: false, en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false })
    .eq('id', dispositivoId)
    .eq('en_espera', true)
    .select('id, modelo, imei');
  if (error) return { error: error.message };
  if (data && data.length > 0) {
    await registrarAuditoria(supabase, {
      accion: `pasó ${descripcion(data[0] as { modelo: string | null; imei: string | null })} de Standby al Stock para entregar un equipo señado`,
      entidad: 'dispositivo',
      entidadId: dispositivoId,
    });
  }
  return { error: null };
}
