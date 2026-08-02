'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

export default function RestablecerContrasena() {
  const supabase = crearClienteNavegador();

  const [sesionValida, setSesionValida] = useState<'cargando' | 'si' | 'no'>('cargando');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSesionValida(user ? 'si' : 'no');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setCargando(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setCargando(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setListo(true);
  };

  if (sesionValida === 'cargando') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (sesionValida === 'no') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-3 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
          Este enlace no es válido o ya venció. Pedí uno nuevo para restablecer tu contraseña.
        </p>
        <Link href="/recuperar-contrasena" className="text-sm text-accent dark:text-dark-accent underline">
          Solicitar nuevo enlace
        </Link>
      </main>
    );
  }

  if (listo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-3 text-center">
        <p className="text-2xl">✅</p>
        <h1 className="text-xl font-display font-semibold">Contraseña actualizada</h1>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Ir al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <h1 className="text-xl font-display font-semibold mb-6">Elegí tu nueva contraseña</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Nueva contraseña</label>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Confirmar contraseña</label>
          <input
            required
            type="password"
            minLength={8}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <button
          disabled={cargando}
          className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {cargando ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </main>
  );
}
