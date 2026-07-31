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
