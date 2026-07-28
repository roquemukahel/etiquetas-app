'use client';

import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';

export default function BotonSalir() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const salir = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button onClick={salir} className="text-xs text-muted dark:text-dark-text-secondary underline">
      Cerrar sesión
    </button>
  );
}
