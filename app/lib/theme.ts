const KEY = 'qovento:theme';

export type Tema = 'light' | 'dark';

export function getTema(): Tema {
  if (typeof window === 'undefined') return 'light';
  return (window.localStorage.getItem(KEY) as Tema) || 'light';
}

export function setTema(tema: Tema) {
  window.localStorage.setItem(KEY, tema);
  document.documentElement.classList.toggle('dark', tema === 'dark');
}

export const SCRIPT_TEMA_INICIAL = `
try {
  var t = localStorage.getItem('${KEY}');
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
`;
