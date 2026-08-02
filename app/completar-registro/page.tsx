'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';

const KEY_PENDING_NEGOCIO = 'qovento:pending-negocio';

// Llega acá justo después de que /auth/callback confirma el mail y crea la
// sesión. Recién ahora (con sesión real) se puede crear el negocio y el
// perfil — en /registro no había sesión todavía porque el mail no estaba
// confirmado.
export default function CompletarRegistro() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: perfil } = await supabase.from('perfiles').select('id').eq('id', user.id).maybeSingle();

      if (!perfil) {
        const nombreNegocio = window.localStorage.getItem(KEY_PENDING_NEGOCIO) || 'Mi negocio';
        const { error: rpcError } = await supabase.rpc('crear_negocio_y_perfil', {
          nombre_negocio: nombreNegocio,
        });
        window.localStorage.removeItem(KEY_PENDING_NEGOCIO);

        if (rpcError) {
          setError(`Tu cuenta se confirmó, pero hubo un problema configurando el negocio: ${rpcError.message}`);
          return;
        }
      }

      router.push('/');
      router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-3 text-center">
      {error ? (
        <>
          <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2 max-w-xs">{error}</p>
          <Link href="/login" className="text-sm text-accent dark:text-dark-accent underline">
            Ir a iniciar sesión
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted dark:text-dark-text-secondary">Confirmando tu cuenta...</p>
      )}
    </main>
  );
}
