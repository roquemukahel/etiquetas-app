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
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 text-center max-w-md w-full">
        <p className="text-lg font-display font-semibold text-white">¡Gracias! 🙌</p>
        <p className="text-sm text-slate-400 mt-1">Recibimos tu mensaje, te vamos a responder a la brevedad.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 flex flex-col gap-3 max-w-md w-full">
      {error && <p className="text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Tu nombre"
        className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
      />
      <input
        value={contacto}
        onChange={(e) => setContacto(e.target.value)}
        placeholder="Email o WhatsApp (opcional)"
        className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
      />
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={3}
        placeholder="Contanos qué necesitás"
        className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
      />
      <button
        disabled={!nombre.trim() || !mensaje.trim() || enviando}
        onClick={enviar}
        className="w-full rounded-xl bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] hover:brightness-110 transition py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {enviando ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </div>
  );
}
