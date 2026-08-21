'use client';

import { useIdioma, setIdioma } from './lib/idioma';

// Login/Registro excluyen la barra "Trabajando como..." (donde vive el
// selector de idioma normal — ver SelectorDeActor.tsx) porque todavía no hay
// nadie logueado. Sin este botón, una persona de habla portuguesa que
// entra por primera vez no tendría forma de cambiar el idioma antes de
// crear su cuenta.
export default function SelectorIdiomaFlotante() {
  const idioma = useIdioma();
  return (
    <button
      type="button"
      onClick={() => setIdioma(idioma === 'es' ? 'pt' : 'es')}
      title={idioma === 'es' ? 'Mudar para português' : 'Cambiar a español'}
      className="fixed top-3 right-3 z-40 rounded-full border border-white/30 bg-ink/70 text-white text-xs font-medium px-2.5 py-1 backdrop-blur-sm hover:bg-ink/90 transition-colors"
    >
      {idioma === 'es' ? '🇧🇷 PT' : '🇦🇷 ES'}
    </button>
  );
}
