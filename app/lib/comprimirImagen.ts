// Achica una foto de cámara (que puede pesar varios MB) antes de guardarla
// como base64: se redimensiona a un ancho máximo y se recomprime a JPEG.
// El resto de la app guarda fotos como base64 sin comprimir — acá conviene
// hacerlo porque puede haber varias fotos de evidencia por reparación (no
// una sola, como un logo), y se acumulan.
export function comprimirImagen(file: File, maxAncho = 1280, calidad = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => reducirImagenDesdeUrl(lector.result as string, maxAncho, calidad).then(resolve, reject);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(file);
  });
}

// Lo mismo pero partiendo de una imagen que YA está como data URL (o cualquier
// URL cargable), por ejemplo una foto pesada guardada hace tiempo.
export function reducirImagenDesdeUrl(src: string, maxAncho = 1280, calidad = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxAncho / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen'));
        return;
      }
      // JPEG no tiene transparencia: sin fondo blanco, un PNG con fondo
      // transparente quedaba con el fondo negro.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}
