'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Soporte() {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [contacto, setContacto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = nombre.trim().length > 0 && mensaje.trim().length > 0;

  const handleEnviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/soporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, contacto, mensaje }),
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
        <p className="text-2xl">✅</p>
        <h1 className="text-xl font-display font-semibold">¡Gracias por escribirnos!</h1>
        <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
          Recibimos tu mensaje y te vamos a responder a la brevedad.
        </p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a Configuración
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
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
        <Campo label="Email o teléfono de contacto (opcional)" valor={contacto} onChange={setContacto} />
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
