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
    // Fondo: en computadora se usa la imagen dividida (izquierda azul con
    // logo+frase, derecha blanca). En tablet/celular la ilustración se
    // oculta y queda un degradado azul de marca, con la tarjeta centrada.
    // min-h-screen (no h-screen) permite scroll vertical si no entra.
    <main
      className="min-h-screen w-full flex items-center justify-center lg:justify-end overflow-x-hidden bg-cover bg-center bg-no-repeat bg-gradient-to-br from-[#0b2a5e] via-[#103a78] to-[#0a1c40] lg:bg-[url('/fondo-login.webp')] px-4 sm:px-6 lg:pr-[7vw] py-10"
    >
      <div className="relative w-full max-w-[400px]">
        {/* Qobi, la mascota, asomándose desde detrás del formulario (solo en
            computadora, donde el sector azul da lugar). Va DETRÁS de la
            tarjeta (z-0 contra z-10) y agarrando el borde izquierdo, así
            parece que sale del formulario. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qobi.webp"
          alt=""
          aria-hidden
          className="hidden lg:block absolute top-1/2 right-full -translate-y-1/2 translate-x-[24%] w-[280px] z-0 pointer-events-none select-none drop-shadow-2xl"
        />
        <div className="relative z-10 w-full bg-white rounded-2xl shadow-elevated p-8 sm:p-9 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="Qovento" className="h-14 w-14 object-contain" />
            <p className="text-lg font-display font-semibold text-ink">Iniciá sesión</p>
          </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs text-muted block mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Contraseña</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <Turnstile onVerify={setCaptchaToken} />

          <button
            disabled={cargando || (REQUIERE_CAPTCHA && !captchaToken)}
            className="mt-1 w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-3.5 text-center text-base font-medium text-white disabled:opacity-40"
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
        </div>
      </div>
    </main>
  );
}
