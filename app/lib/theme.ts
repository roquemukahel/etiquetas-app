const KEY = 'qovento:theme';

// Tres modos: claro, oscuro y "Qovento" (un modo propio con fondo azulado de
// marca en toda la app). El modo Qovento usa el estilo oscuro como base
// (clase `dark`: tarjetas oscuras, texto claro) y además su propia clase
// `qovento` que agrega el fondo (ver styles/globals.css).
export type Tema = 'light' | 'dark' | 'qovento';

export function getTema(): Tema {
  if (typeof window === 'undefined') return 'light';
  const t = window.localStorage.getItem(KEY);
  return t === 'dark' || t === 'qovento' ? t : 'light';
}

export function setTema(tema: Tema) {
  window.localStorage.setItem(KEY, tema);
  const html = document.documentElement;
  html.classList.toggle('dark', tema === 'dark' || tema === 'qovento');
  html.classList.toggle('qovento', tema === 'qovento');
}

export const SCRIPT_TEMA_INICIAL = `
try {
  var t = localStorage.getItem('${KEY}');
  var h = document.documentElement;
  if (t === 'dark' || t === 'qovento') h.classList.add('dark');
  if (t === 'qovento') h.classList.add('qovento');
} catch (e) {}
`;
