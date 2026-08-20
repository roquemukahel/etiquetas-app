'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ICONOS } from '../../Iconos';

export default function Soporte() {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const puedeEnviar = nombre.trim().length > 0 && emailValido && mensaje.trim().length > 0;

  const handleEnviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/soporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, email, telefono, mensaje }),
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex items-center justify-center h-12 w-12 rounded-full bg-good/10 text-good [&_svg]:h-6 [&_svg]:w-6">
          {ICONOS.check}
        </span>
        <h1 className="text-xl font-display font-semibold">¡Gracias por escribirnos!</h1>
        <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
          Recibimos tu mensaje y te vamos a responder a la brevedad.
        </p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Soporte</span>
      </header>

      <p className="text-sm text-muted dark:text-dark-text-secondary">
        ¿Tuviste algún problema, tenés alguna sugerencia o querés dejarnos un mensaje? Escribinos acá abajo.
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <Campo label="Nombre" valor={nombre} onChange={setNombre} />
        <Campo label="Apellido" valor={apellido} onChange={setApellido} />
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="tu@email.com"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
          {email.trim().length > 0 && !emailValido && (
            <p className="text-xs text-bad mt-1">Ese email no parece válido.</p>
          )}
        </div>
        <Campo label="Teléfono (opcional)" valor={telefono} onChange={setTelefono} />
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Mensaje</label>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={5}
            placeholder="Contanos qué pasó o qué te gustaría que agreguemos..."
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <button
        disabled={!puedeEnviar || enviando}
        onClick={handleEnviar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {enviando ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </main>
  );
}

function Campo({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
