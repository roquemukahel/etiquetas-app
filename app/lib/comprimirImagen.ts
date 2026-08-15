// Achica una foto de cámara (que puede pesar varios MB) antes de guardarla
// como base64: se redimensiona a un ancho máximo y se recomprime a JPEG.
// El resto de la app guarda fotos como base64 sin comprimir — acá conviene
// hacerlo porque puede haber varias fotos de evidencia por reparación (no
// una sola, como un logo), y se acumulan.
export function comprimirImagen(file: File, maxAncho = 1280, calidad = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
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
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = lector.result as string;
    };
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(file);
  });
}
