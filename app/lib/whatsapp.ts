// Arma un link de WhatsApp con el mensaje ya escrito. El empleado solo
// tiene que apretar "Enviar" — no hay ninguna cuenta ni API que configurar.
export function armarLinkWhatsApp(telefono: string | null | undefined, mensaje: string) {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  // Heurística simple: si no parece tener código de país, asumimos Argentina.
  const numeroCompleto = digitos && !digitos.startsWith('54') ? `54${digitos}` : digitos;

  const params = new URLSearchParams({ text: mensaje });
  return numeroCompleto
    ? `https://wa.me/${numeroCompleto}?${params.toString()}`
    : `https://api.whatsapp.com/send?${params.toString()}`;
}

export function mensajeSeguimientoServicio(nombreCliente: string, modelo: string, urlSeguimiento: string) {
  return `Hola ${nombreCliente}! Gracias por elegirnos 🙌 Ya registramos tu ${modelo} para el servicio técnico. Podés seguir el estado de tu reparación en este link: ${urlSeguimiento}`;
}
