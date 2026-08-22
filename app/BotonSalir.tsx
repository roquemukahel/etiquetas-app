'use client';

import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from './lib/supabase/client';
import { clearActor } from './lib/actor';
import { useT } from './lib/idioma';

export default function BotonSalir({ className = 'text-xs text-muted dark:text-dark-text-secondary underline' }: { className?: string }) {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();

  const salir = async () => {
    await supabase.auth.signOut();
    clearActor();
    router.push('/login');
    router.refresh();
  };

  return (
    <button onClick={salir} className={className}>
      {t('Cerrar sesión')}
    </button>
  );
}
