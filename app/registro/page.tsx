'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';

export default function Registro() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
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

    // Creamos el negocio y lo vinculamos al usuario recién creado
    const { data: negocio, error: negocioError } = await supabase
      .from('negocios')
      .insert({ nombre: nombreNegocio })
      .select()
      .single();

    if (negocioError || !negocio) {
      setError(
        `La cuenta se creó, pero hubo un problema configurando el negocio: ${
          negocioError?.message || 'sin negocio'
        }`
      );
      setCargando(false);
      return;
    }

    const { error: perfilError } = await supabase
      .from('perfiles')
      .insert({ id: authData.user.id, negocio_id: negocio.id });

    if (perfilError) {
      setError(`La cuenta y el negocio se crearon, pero falló el perfil: ${perfilError.message}`);
      setCargando(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <h1 className="text-2xl font-medium text-center mb-2">Creá tu cuenta</h1>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted block mb-1">Nombre de tu negocio</label>
          <input
            required
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
            placeholder="Mi local de celulares"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Contraseña</label>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <button
          disabled={cargando}
          className="mt-2 w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
        >
          {cargando ? 'Creando...' : 'Crear cuenta'}
        </button>

        <p className="text-center text-sm text-muted">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-accent underline">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
