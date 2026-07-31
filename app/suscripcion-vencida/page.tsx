'use client';

import { useEffect, useState } from 'react';
import BotonSalir from '../BotonSalir';
import { crearClienteNavegador } from '../lib/supabase/client';
import PlanesCheckout from '../PlanesCheckout';

export default function SuscripcionVencida() {
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<{ negocioId: string; email: string | null } | null>(null);

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
        setDatos({ negocioId: perfil.negocio_id, email: user.email ?? null });
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
      {datos && (
        <div className="w-full max-w-xs">
          <PlanesCheckout negocioId={datos.negocioId} email={datos.email} />
        </div>
      )}
      <BotonSalir />
    </main>
  );
}
