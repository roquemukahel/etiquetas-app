'use client';

import { useIdioma, setIdioma, useT, IDIOMAS_DISPONIBLES, siguienteIdioma } from './lib/idioma';

// Login/Registro excluyen la barra "Trabajando como..." (donde vive el
// selector de idioma normal — ver SelectorDeActor.tsx) porque todavía no hay
// nadie logueado. Sin este botón, una persona de habla portuguesa/inglesa
// que entra por primera vez no tendría forma de cambiar el idioma antes de
// crear su cuenta.
export default function SelectorIdiomaFlotante() {
  const idioma = useIdioma();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => setIdioma(siguienteIdioma(idioma))}
      title={t('Cambiar idioma')}
      className="fixed top-3 right-3 z-40 rounded-full border border-white/30 bg-ink/70 text-white text-xs font-medium px-2.5 py-1 backdrop-blur-sm hover:bg-ink/90 transition-colors"
    >
      {IDIOMAS_DISPONIBLES.find((i) => i.valor === idioma)?.etiqueta ?? idioma}
    </button>
  );
}
