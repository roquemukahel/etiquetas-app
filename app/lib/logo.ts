const KEY = 'etiquetas:logo';

export function getLogo(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function setLogo(dataUrl: string) {
  window.localStorage.setItem(KEY, dataUrl);
}
