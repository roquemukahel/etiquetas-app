// Fotos reales de cada celular (opcionales): tabla aparte `dispositivo_fotos` (ver dispositivo_fotos_supabase.sql)
// para que los listados de Stock no carguen imágenes. Cada foto se guarda reducida (~1280 px) más una miniatura
// (~320 px), igual que el resto de las fotos de la app (base64 comprimido, ver comprimirImagen.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActor } from './actor';
import { registrarAuditoria } from './auditoria';
import { comprimirImagen, reducirImagenDesdeUrl } from './comprimirImagen';
import { enLotes, obtenerTodasLasFilas } from './db';
import { soportaMigracion } from './migraciones';

export const MAX_FOTOS_POR_EQUIPO = 8;

export type FotoDispositivo = {
  id: string;
  dispositivo_id: string;
  foto_url: string;
  miniatura_url: string | null;
  orden: number;
  created_at: string;
};

export type FotoPreparada = { foto_url: string; miniatura_url: string };

export async function prepararFoto(file: File): Promise<FotoPreparada> {
  const foto_url = await comprimirImagen(file, 1280, 0.72);
  const miniatura_url = await reducirImagenDesdeUrl(foto_url, 320, 0.6);
  return { foto_url, miniatura_url };
}

export async function obtenerFotos(supabase: SupabaseClient, dispositivoId: string): Promise<FotoDispositivo[] | { error: string }> {
  const { data, error } = await supabase
    .from('dispositivo_fotos')
    .select('id, dispositivo_id, foto_url, miniatura_url, orden, created_at')
    .eq('dispositivo_id', dispositivoId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { error: error.message };
  return (data as FotoDispositivo[]) ?? [];
}

// Cuántas fotos tiene cada equipo (solo el id, liviano) para mostrar el 📷 en la lista de Stock. Si el negocio
// todavía no corrió dispositivo_fotos_supabase.sql, devuelve un mapa vacío.
export async function contarFotosPorDispositivo(supabase: SupabaseClient): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!(await soportaMigracion(supabase, 'fotosDispositivo'))) return mapa;
  const filas = await obtenerTodasLasFilas<{ dispositivo_id: string }>(supabase, 'dispositivo_fotos', 'dispositivo_id');
  for (const f of filas) mapa.set(f.dispositivo_id, (mapa.get(f.dispositivo_id) ?? 0) + 1);
  return mapa;
}

// Cuántas fotos tiene cada uno de ESTOS equipos (los de la pantalla), en vez de las de todo el negocio: Standby lo usa
// solo para los que se ven. Por lotes de 100 ids (el largo de la URL tiene tope).
export async function contarFotosDe(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (ids.length === 0 || !(await soportaMigracion(supabase, 'fotosDispositivo'))) return mapa;
  const resultados = await Promise.all(
    enLotes(ids).map(async (lote) => {
      const { data, error } = await supabase.from('dispositivo_fotos').select('dispositivo_id').in('dispositivo_id', lote);
      return error ? [] : ((data ?? []) as { dispositivo_id: string }[]);
    })
  );
  for (const filas of resultados) for (const f of filas) mapa.set(f.dispositivo_id, (mapa.get(f.dispositivo_id) ?? 0) + 1);
  return mapa;
}

export async function guardarFotos(
  supabase: SupabaseClient,
  dispositivoId: string,
  fotos: FotoPreparada[],
  ordenInicial: number
): Promise<{ error: string | null }> {
  if (fotos.length === 0) return { error: null };
  const actor = getActor();
  const { error } = await supabase.from('dispositivo_fotos').insert(
    fotos.map((f, i) => ({
      dispositivo_id: dispositivoId,
      foto_url: f.foto_url,
      miniatura_url: f.miniatura_url,
      orden: ordenInicial + i,
      actor_nombre: actor?.nombre ?? null,
    }))
  );
  return { error: error?.message ?? null };
}

export async function eliminarFoto(supabase: SupabaseClient, foto: FotoDispositivo, modeloDelEquipo: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('dispositivo_fotos').delete().eq('id', foto.id);
  if (error) return { error: error.message };
  await registrarAuditoria(supabase, {
    accion: `eliminó una foto del equipo ${modeloDelEquipo || 'sin modelo'}`,
    entidad: 'dispositivo',
    entidadId: foto.dispositivo_id,
  });
  return { error: null };
}

// La principal es la de menor "orden": para elegir otra se le pone uno menos que el mínimo actual.
export async function ponerFotoPrincipal(supabase: SupabaseClient, foto: FotoDispositivo, todas: FotoDispositivo[]): Promise<{ error: string | null }> {
  const minimo = Math.min(...todas.map((f) => f.orden));
  if (foto.orden === minimo && todas.filter((f) => f.orden === minimo).length === 1) return { error: null };
  const { error } = await supabase.from('dispositivo_fotos').update({ orden: minimo - 1 }).eq('id', foto.id);
  return { error: error?.message ?? null };
}
