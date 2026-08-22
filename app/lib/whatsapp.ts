// Arma un link de WhatsApp con el mensaje ya escrito. El empleado solo
// tiene que apretar "Enviar" — no hay ninguna cuenta ni API que configurar.
export function armarLinkWhatsApp(telefono: string | null | undefined, mensaje: string, codigoPais = '54') {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  // Heurística simple: si el número no arranca ya con el código de país del
  // negocio (configurable en Configuración > Negocio), se lo anteponemos.
  const numeroCompleto = digitos && !digitos.startsWith(codigoPais) ? `${codigoPais}${digitos}` : digitos;

  const params = new URLSearchParams({ text: mensaje });
  return numeroCompleto
    ? `https://wa.me/${numeroCompleto}?${params.toString()}`
    : `https://api.whatsapp.com/send?${params.toString()}`;
}

export function mensajeSeguimientoServicio(nombreCliente: string, modelo: string, urlSeguimiento: string) {
  return `Hola ${nombreCliente}! Gracias por elegirnos 🙌 Ya registramos tu ${modelo} para el servicio técnico. Podés seguir el estado de tu reparación en este link: ${urlSeguimiento}`;
}

export function mensajeListoServicio(nombreCliente: string, modelo: string, urlSeguimiento: string) {
  return `Hola ${nombreCliente}! Te contamos que tu ${modelo} ya está listo ✅ Podés pasar a retirarlo cuando quieras. Más detalles acá: ${urlSeguimiento}`;
}

export function mensajePresupuesto(nombreCliente: string, modelo: string, monto: string, urlSeguimiento: string) {
  return `Hola ${nombreCliente}! Ya diagnosticamos tu ${modelo}. El presupuesto es de ${monto}. Avisanos si lo aprobás para arrancar con la reparación. Más detalles acá: ${urlSeguimiento}`;
}

export function mensajeEsperandoRepuesto(nombreCliente: string, modelo: string, urlSeguimiento: string) {
  return `Hola ${nombreCliente}! Te contamos que tu ${modelo} está esperando un repuesto para poder terminar la reparación. Te avisamos apenas llegue. Más detalles acá: ${urlSeguimiento}`;
}

// t opcional — quien llama desde un componente cliente pasa su useT() para
// que el mensaje salga en el idioma que esa persona tiene elegido (mismo
// criterio que la boleta que este comprobante acompaña).
export function mensajeComprobantePlanAhorro(
  nombreCliente: string,
  monto: string,
  modelo: string,
  urlComprobante: string,
  t: (texto: string) => string = (s) => s
) {
  return `${t('Hola')} ${nombreCliente}! ${t('Te confirmamos tu pago de')} ${monto} ${t('para el plan de ahorro de')} ${modelo}. ${t('Acá tenés tu comprobante:')} ${urlComprobante}`;
}

export function mensajeConsultaProveedor(nombreRepuesto: string) {
  return `Hola! Te consulto por precio y disponibilidad de: ${nombreRepuesto}`;
}
