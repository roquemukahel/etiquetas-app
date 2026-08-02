'use client';

import { useEffect, useState } from 'react';
import BotonSalir from '../BotonSalir';
import { crearClienteNavegador } from '../lib/supabase/client';
import PlanesCheckout from '../PlanesCheckout';
import PagoUSDT from '../PagoUSDT';

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  estado: string;
  created_at: string;
  nota_admin: string | null;
};

export default function SuscripcionVencida() {
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<{ negocioId: string; email: string | null } | null>(null);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);

  const cargarComprobante = async (negocioId: string) => {
    const { data } = await supabase
      .from('comprobantes_pago')
      .select('id, monto, moneda, estado, created_at, nota_admin')
      .eq('negocio_id', negocioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setComprobante((data as Comprobante) ?? null);
  };

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
        await cargarComprobante(perfil.negocio_id);
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
        <div className="w-full max-w-xs flex flex-col gap-3">
          <PlanesCheckout negocioId={datos.negocioId} email={datos.email} />
          <PagoUSDT negocioId={datos.negocioId} comprobante={comprobante} onEnviado={() => cargarComprobante(datos.negocioId)} />
        </div>
      )}
      <BotonSalir />
    </main>
  );
}
