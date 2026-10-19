import type { SupabaseClient } from '@supabase/supabase-js';

// Detecta (una vez por sesión) si el negocio ya corrió una migración opcional:
// mientras no la corrió, la pantalla sigue como siempre en vez de romperse al
// pedir una columna o tabla que todavía no existe.
const CHEQUEOS = {
  // financiacion_guia_cartera_supabase.sql
  clienteSucursalOrigen: (s: SupabaseClient) => s.from('clientes').select('sucursal_origen_id').limit(1),
  guiaFinanciacion: (s: SupabaseClient) => s.from('productos').select('financiacion_max_cuotas, precio_lista').limit(1),
  guiaFinanciacionDispositivos: (s: SupabaseClient) => s.from('dispositivos').select('financiacion_max_cuotas, precio_lista').limit(1),
  guiaFinanciacionCategorias: (s: SupabaseClient) => s.from('stock_categorias').select('financiacion_max_cuotas').limit(1),
  guiaFinanciacionMaestro: (s: SupabaseClient) => s.from('productos_maestro').select('financiacion_max_cuotas, precio_lista').limit(1),
  creditosFueraGuia: (s: SupabaseClient) => s.from('creditos_fuera_guia').select('id').limit(1),
  // permisos_sensibles_supabase.sql (cargar egresos, registrar pagos a proveedores, ver costos y márgenes)
  permisosSensibles: (s: SupabaseClient) => s.from('vendedores').select('puede_cargar_egresos, puede_registrar_pagos_proveedores, puede_ver_costos').limit(1),
  // servicio_tecnico_recibido_por_supabase.sql
  recibidoPor: (s: SupabaseClient) => s.from('reparaciones').select('recibido_por_nombre').limit(1),
  // dispositivo_fotos_supabase.sql
  fotosDispositivo: (s: SupabaseClient) => s.from('dispositivo_fotos').select('id').limit(1),
  // ingresos_capital_supabase.sql
  ingresosCapital: (s: SupabaseClient) => s.from('ingresos').select('id').limit(1),
  // egresos_duenos_supabase.sql
  egresosDuenos: (s: SupabaseClient) => s.from('egresos').select('pagado_desde').limit(1),
  categoriasEgresosDuenos: (s: SupabaseClient) => s.from('egresos_categorias').select('solo_duenos, rol').limit(1),
} as const;

export type MigracionOpcional = keyof typeof CHEQUEOS;

const cache = new Map<string, Promise<boolean>>();

export function soportaMigracion(supabase: SupabaseClient, clave: MigracionOpcional): Promise<boolean> {
  let p = cache.get(clave);
  if (!p) {
    p = Promise.resolve(CHEQUEOS[clave](supabase)).then(
      ({ error }: { error: unknown }) => !error,
      () => false
    );
    cache.set(clave, p);
  }
  return p;
}
