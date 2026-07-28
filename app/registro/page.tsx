'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import Turnstile from '../Turnstile';

const REQUIERE_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function Registro() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (authError || !authData.user) {
      setError(authError?.message || 'No se pudo crear la cuenta');
      setCargando(false);
      return;
    }

    if (!authData.session) {
      setError(
        'La cuenta ya existía o no se generó sesión automáticamente. Probá borrar el usuario en Supabase y registrarte de nuevo, o iniciá sesión si ya tenés cuenta.'
      );
      setCargando(false);
      return;
    }

    // Creamos el negocio y el perfil juntos, en un solo paso seguro
    const { data: negocioId, error: rpcError } = await supabase.rpc('crear_negocio_y_perfil', {
      nombre_negocio: nombreNegocio,
    });

    if (rpcError || !negocioId) {
      setError(`La cuenta se creó, pero hubo un problema configurando el negocio: ${rpcError?.message || 'sin datos'}`);
      setCargando(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="flex flex-col items-center gap-3 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qovento-logo.png" alt="Qovento" className="h-11 w-auto object-contain" />
        <h1 className="text-2xl font-display font-semibold">Creá tu cuenta</h1>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Nombre de tu negocio</label>
          <input
            required
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            placeholder="Mi local de celulares"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Contraseña</label>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <Turnstile onVerify={setCaptchaToken} />

        <button
          disabled={cargando || (REQUIERE_CAPTCHA && !captchaToken)}
          className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {cargando ? 'Creando...' : 'Crear cuenta'}
        </button>

        <p className="text-center text-sm text-muted dark:text-dark-text-secondary">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-accent dark:text-dark-accent underline">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
