'use client';

// Dictado por voz usando la Web Speech API del navegador (nativa, sin
// librerías externas). Disponible en Chrome/Android de forma confiable;
// en otros navegadores el botón de micrófono simplemente no aparece.
export function useDictado() {
  const soportado =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const dictar = (onResultado: (texto: string) => void, onFin?: () => void) => {
    const Reconocedor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Reconocedor) {
      onFin?.();
      return;
    }

    const recognition = new Reconocedor();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const texto = event.results?.[0]?.[0]?.transcript ?? '';
      if (texto) onResultado(texto);
    };
    recognition.onend = () => onFin?.();

    recognition.start();
  };

  return { dictar, soportado };
}
