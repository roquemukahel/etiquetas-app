'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import Turnstile from '../Turnstile';

const REQUIERE_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Antes cualquier error de signInWithPassword (captcha vencido, demasiados
// intentos seguidos, corte de red) se mostraba siempre como "contraseña
// incorrecta" — un mensaje falso que hacía pensar que el problema era la
// contraseña cuando en realidad era otra cosa (y ni "reintentar con la
// misma contraseña" ni cambiarla solucionaba nada, solo esperar o refrescar
// la página para conseguir un captcha nuevo).
function mensajeErrorLogin(authError: { message: string; status?: number }) {
  const msg = authError.message?.toLowerCase() || '';
  if (msg.includes('captcha')) {
    return 'No pudimos verificar que sos una persona (venció la verificación). Volvé a intentar.';
  }
  if (authError.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'Demasiados intentos seguidos. Esperá un minuto y volvé a intentar.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos';
  }
  return `No pudimos iniciar sesión: ${authError.message}`;
}

export default function Login() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (authError) {
      setError(mensajeErrorLogin(authError));
      setCargando(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="flex flex-col items-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qovento-logo.png" alt="Qovento" className="h-40 w-auto object-contain" />
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

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
          {cargando ? 'Entrando...' : 'Iniciar sesión'}
        </button>

        <p className="text-center text-sm text-muted dark:text-dark-text-secondary">
          ¿No tenés cuenta?{' '}
          <Link href="/registro" className="text-accent dark:text-dark-accent underline">
            Registrate
          </Link>
        </p>
      </form>
    </main>
  );
}
