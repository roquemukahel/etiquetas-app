// ============================================================
// Llamada al endpoint de Qovi desde el navegador — el componente de la
// burbuja no habla con Supabase ni con Anthropic directamente, todo pasa
// por /api/qovi/chat (la clave vive solo en el servidor).
// ============================================================
import type { RespuestaQovi } from './respuesta';
import type { ModuloQovi } from './modulos';
import type { RolQovi } from './rol';

export type PedidoQovi = {
  mensaje: string;
  moduloActual: ModuloQovi;
  rolActual: RolQovi;
  conversacionId: string | null;
  actorNombre: string | null;
  actorTipo: string | null;
};

// El servidor, salvo en casos realmente excepcionales (401, red caída,
// cuerpo roto), siempre devuelve una `respuesta` ya armada y lista para
// mostrar — incluso cuando está deshabilitado, al límite, o hubo un error
// interno (respuestaDeshabilitado/Limite/Error en respuesta.ts). Por eso
// "ok: true" acá significa "hay algo para mostrarle al usuario", no
// "status 200".
export type RespuestaApiQovi =
  | { ok: true; respuesta: RespuestaQovi; conversacionId: string | null; mensajeId: string | null; limiteAlcanzado: boolean }
  | { ok: false; mensaje: string };

export async function preguntarQovi(pedido: PedidoQovi): Promise<RespuestaApiQovi> {
  try {
    const res = await fetch('/api/qovi/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    });
    if (res.status === 401) return { ok: false, mensaje: 'Tu sesión venció. Recargá la página.' };

    const datos = await res.json().catch(() => null);
    if (!datos) return { ok: false, mensaje: 'No pudimos entender la respuesta del servidor.' };
    if (datos.respuesta) {
      return {
        ok: true,
        respuesta: datos.respuesta,
        conversacionId: datos.conversacionId ?? null,
        mensajeId: datos.mensajeId ?? null,
        limiteAlcanzado: res.status === 429,
      };
    }
    return { ok: false, mensaje: datos.error || 'No pudimos responder.' };
  } catch {
    return { ok: false, mensaje: 'No pudimos conectar con Qovi. Revisá tu conexión.' };
  }
}
