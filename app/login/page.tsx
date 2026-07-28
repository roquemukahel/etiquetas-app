'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';

export default function Login() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Email o contraseña incorrectos');
      setCargando(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <h1 className="text-2xl font-medium text-center mb-2">Qovento</h1>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted block mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Contraseña</label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <button
          disabled={cargando}
          className="mt-2 w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {cargando ? 'Entrando...' : 'Iniciar sesión'}
        </button>

        <p className="text-center text-sm text-muted">
          ¿No tenés cuenta?{' '}
          <Link href="/registro" className="text-accent underline">
            Registrate
          </Link>
        </p>
      </form>
    </main>
  );
}
