'use client';

import { useEffect, useRef } from 'react';

// Qovi asomándose por el borde izquierdo de la tarjeta de Resumen financiero
// de Inicio (public/qovi-lateral.png, tal cual la subió el dueño — el borde
// derecho de la imagen YA ES el borde del panel que agarra con las manos,
// sin margen transparente). "right-full" solo lo deja tocando el borde de
// afuera de la tarjeta, lo que se ve como un hueco entre el borde dibujado
// en la imagen y el borde real de la tarjeta (dos tonos de oscuro distintos
// quedaban pegados uno al lado del otro en vez de superpuestos). El
// "translate-x-[18%]" adicional lo mete un poco hacia adentro para que los
// dedos realmente entren en la tarjeta y el borde de la imagen quede tapado.
//
// Las pupilas rojas son dos <span> propios superpuestos sobre los ojos
// celestes de la imagen (no se edita el PNG). Sus posiciones (ojoIzq/ojoDer)
// se calcularon una sola vez a partir de los píxeles más brillantes de cada
// ojo en la imagen original (1116×1409), no a ojo.
const OJOS = [
  { left: 40.0, top: 34.3 }, // ojo derecho de Qovi (más a la izquierda en la imagen)
  { left: 55.7, top: 28.0 }, // ojo izquierdo de Qovi
];
// Cuánto puede desplazarse cada pupila desde el centro de su ojo, en % del
// ancho de la imagen — chico a propósito, para que nunca "se salga" del
// círculo celeste de fondo.
const RADIO_PUPILA_PCT = 1.6;

export default function QoviLateral() {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const pupilasRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mover = (e: MouseEvent) => {
      const cont = contenedorRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      if (rect.width === 0) return;
      const radioPx = (RADIO_PUPILA_PCT / 100) * rect.width;

      OJOS.forEach((ojo, i) => {
        const pupila = pupilasRef.current[i];
        if (!pupila) return;
        const cx = rect.left + (ojo.left / 100) * rect.width;
        const cy = rect.top + (ojo.top / 100) * rect.height;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const ox = (dx / dist) * radioPx;
        const oy = (dy / dist) * radioPx;
        pupila.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      });
    };

    window.addEventListener('mousemove', mover);
    return () => window.removeEventListener('mousemove', mover);
  }, []);

  return (
    <div
      ref={contenedorRef}
      aria-hidden="true"
      className="hidden lg:block pointer-events-none select-none absolute right-full top-1/2 -translate-y-1/2 translate-x-[18%] w-36 xl:w-44 z-20 drop-shadow-2xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/qovi-lateral.png" alt="" className="block w-full h-auto" />
      {OJOS.map((ojo, i) => (
        <span
          key={i}
          ref={(el) => {
            pupilasRef.current[i] = el;
          }}
          className="absolute h-[4.5%] w-[4.5%] rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.75)] transition-transform duration-100 ease-out motion-reduce:hidden"
          style={{ left: `${ojo.left}%`, top: `${ojo.top}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
    </div>
  );
}
