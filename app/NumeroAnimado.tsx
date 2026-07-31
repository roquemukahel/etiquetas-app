'use client';

import { useEffect, useState } from 'react';

// Anima un número contando desde 0 hasta su valor final al montarse (ease-out,
// ~800ms). Respeta "reducir movimiento": si el sistema lo tiene activado,
// muestra el valor final directo, sin animar.
export default function NumeroAnimado({
  valor,
  prefijo = '',
  duracionMs = 800,
}: {
  valor: number;
  prefijo?: string;
  duracionMs?: number;
}) {
  const [mostrado, setMostrado] = useState(valor);

  useEffect(() => {
    const prefiereReducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefiereReducido) {
      setMostrado(valor);
      return;
    }

    setMostrado(0);
    let inicio: number | null = null;
    let frame: number;

    const paso = (timestamp: number) => {
      if (inicio === null) inicio = timestamp;
      const progreso = Math.min(1, (timestamp - inicio) / duracionMs);
      const facilitado = 1 - Math.pow(1 - progreso, 3);
      setMostrado(Math.round(valor * facilitado));
      if (progreso < 1) frame = requestAnimationFrame(paso);
    };

    frame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(frame);
  }, [valor, duracionMs]);

  return (
    <>
      {prefijo}
      {mostrado.toLocaleString('es-AR')}
    </>
  );
}
