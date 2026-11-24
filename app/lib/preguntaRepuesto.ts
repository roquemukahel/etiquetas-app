// ============================================================
// Pregunta "¿se usó repuesto?" al pasar una reparación a Listo para entregar. cambiarEstadoReparacion (lib) no tiene pantalla propia, así que
// pide la respuesta a un componente que vive en el AppShell (AnfitrionRepuesto) y espera a que la persona conteste. Si no contesta
// (cierra el cartel), el cambio de estado se cancela: la pregunta no se puede saltear.
// ============================================================
export type ReparacionParaPregunta = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  sucursal_id: string | null;
};

export type RespuestaPregunta = 'respondida' | 'cancelada';

export type PedidoRepuesto = {
  reparacion: ReparacionParaPregunta;
  resolver: (respuesta: RespuestaPregunta) => void;
};

let anfitrion: ((pedido: PedidoRepuesto) => void) | null = null;

// El AppShell se registra al montarse; devuelve la función para desregistrarse.
export function registrarAnfitrionRepuesto(fn: (pedido: PedidoRepuesto) => void): () => void {
  anfitrion = fn;
  return () => {
    if (anfitrion === fn) anfitrion = null;
  };
}

// Sin anfitrión (pantalla sin AppShell) no hay dónde preguntar: se devuelve 'cancelada' para no avanzar sin la respuesta.
export function preguntarSiSeUsoRepuesto(reparacion: ReparacionParaPregunta): Promise<RespuestaPregunta> {
  return new Promise((resolve) => {
    if (!anfitrion) {
      resolve('cancelada');
      return;
    }
    anfitrion({ reparacion, resolver: resolve });
  });
}
