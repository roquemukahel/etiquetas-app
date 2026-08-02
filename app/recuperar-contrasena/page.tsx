'use client';

import { useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import Turnstile from '../Turnstile';

const REQUIERE_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function RecuperarContrasena() {
  const supabase = crearClienteNavegador();

  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer-contrasena`,
      ...(captchaToken ? { captchaToken } : {}),
    });

    setCargando(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setEnviado(true);
  };

  if (enviado) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-3 text-center">
        <p className="text-2xl">📧</p>
        <h1 className="text-xl font-display font-semibold">Revisá tu correo</h1>
        <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
          Si <strong>{email}</strong> tiene una cuenta en Qovento, te enviamos un enlace para elegir una nueva
          contraseña.
        </p>
        <Link href="/login" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="flex flex-col items-center gap-2 mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qovento-logo.png" alt="Qovento" className="h-28 w-auto object-contain" />
        <h1 className="text-xl font-display font-semibold">Recuperar contraseña</h1>
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center max-w-xs">
          Ingresá el email de tu cuenta y te mandamos un enlace para elegir una nueva contraseña.
        </p>
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

        <Turnstile onVerify={setCaptchaToken} />

        <button
          disabled={cargando || (REQUIERE_CAPTCHA && !captchaToken)}
          className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {cargando ? 'Enviando...' : 'Enviar enlace'}
        </button>

        <p className="text-center text-sm text-muted dark:text-dark-text-secondary">
          <Link href="/login" className="text-accent dark:text-dark-accent underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
