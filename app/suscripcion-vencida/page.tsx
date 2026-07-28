'use client';

import { useEffect, useState } from 'react';
import BotonSalir from '../BotonSalir';
import { crearClienteNavegador } from '../lib/supabase/client';
import { armarLinkCheckout } from '../lib/lemonsqueezy';

export default function SuscripcionVencida() {
  const supabase = crearClienteNavegador();
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocio_id')
        .eq('id', user.id)
        .single();

      if (perfil?.negocio_id) {
        setLink(armarLinkCheckout(perfil.negocio_id, user.email));
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-4 text-center">
      <p className="text-2xl">⏳</p>
      <h1 className="text-xl font-display font-semibold">Tu suscripción no está activa</h1>
      <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
        El período de prueba terminó o hubo un problema con el pago. Suscribite para seguir usando Qovento.
      </p>
      {link && (
        <a
          href={link}
          className="w-full max-w-xs rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white"
        >
          Suscribirme ahora
        </a>
      )}
      <BotonSalir />
    </main>
  );
}
