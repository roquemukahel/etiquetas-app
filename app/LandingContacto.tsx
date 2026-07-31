'use client';

import { useState } from 'react';

export default function LandingContacto() {
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!nombre.trim() || !mensaje.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/soporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, contacto, mensaje }),
      });
      if (!res.ok) throw new Error();
      setEnviado(true);
    } catch {
      setError('No pudimos enviar tu mensaje. Probá de nuevo en un rato.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-6 text-center">
        <p className="text-lg font-display font-semibold">¡Gracias! 🙌</p>
        <p className="text-sm text-muted dark:text-dark-text-secondary mt-1">Recibimos tu mensaje, te vamos a responder a la brevedad.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-6 flex flex-col gap-3 max-w-md w-full">
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Tu nombre"
        className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
      <input
        value={contacto}
        onChange={(e) => setContacto(e.target.value)}
        placeholder="Email o WhatsApp (opcional)"
        className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={3}
        placeholder="Contanos qué necesitás"
        className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
      <button
        disabled={!nombre.trim() || !mensaje.trim() || enviando}
        onClick={enviar}
        className="w-full rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
      >
        {enviando ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </div>
  );
}
