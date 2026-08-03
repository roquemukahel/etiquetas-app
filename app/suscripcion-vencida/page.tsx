'use client';

import { useEffect, useState } from 'react';
import BotonSalir from '../BotonSalir';
import { crearClienteNavegador } from '../lib/supabase/client';
import PlanesCheckout from '../PlanesCheckout';
import PagoUSDT from '../PagoUSDT';
import PagoTransferenciaARS from '../PagoTransferenciaARS';

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  estado: string;
  created_at: string;
  nota_admin: string | null;
};

type Datos = {
  negocioId: string;
  email: string | null;
  nombreNegocio: string;
  eraPrueba: boolean;
};

export default function SuscripcionVencida() {
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<Datos | null>(null);
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
        .select('negocio_id, negocios ( nombre, estado_suscripcion )')
        .eq('id', user.id)
        .single();

      const negocio = (perfil as any)?.negocios ?? null;
      if (perfil?.negocio_id) {
        setDatos({
          negocioId: perfil.negocio_id,
          email: user.email ?? null,
          nombreNegocio: negocio?.nombre || 'tu negocio',
          eraPrueba: negocio?.estado_suscripcion === 'trialing',
        });
        await cargarComprobante(perfil.negocio_id);
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-5 text-center">
      <p className="text-2xl">👋</p>

      {datos?.eraPrueba ? (
        <div className="max-w-sm flex flex-col gap-3 text-left">
          <h1 className="text-lg font-display font-semibold text-center">
            Estimado equipo de {datos.nombreNegocio}
          </h1>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            Antes que nada, ¡gracias por darle una oportunidad a Qovento! Esperamos que estos días de prueba te
            hayan servido y que el sistema ya se haya vuelto parte de tu rutina diaria. Para nosotros es un
            gusto que formes parte de esta comunidad, que crece gracias a locales como el tuyo.
          </p>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            Qovento está en desarrollo constante: seguimos sumando funciones nuevas todo el tiempo, y tus
            sugerencias siempre son bienvenidas.
          </p>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            Tu período de prueba gratuita llegó a su fin. Para seguir usando el sistema te pedimos que
            actives tu suscripción — ese aporte es lo que nos permite seguir manteniendo y mejorando la
            plataforma.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-display font-semibold">Tu suscripción no está activa</h1>
          <p className="text-sm text-muted dark:text-dark-text-secondary max-w-xs">
            Hubo un problema con el pago o tu acceso venció. Regularizá tu suscripción para seguir usando Qovento.
          </p>
        </>
      )}

      {datos && (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <PlanesCheckout negocioId={datos.negocioId} email={datos.email} />
          <p className="text-xs text-muted dark:text-dark-text-secondary -mb-1">
            Por el momento, el pago con tarjeta está temporalmente no disponible mientras terminamos un
            trámite de verificación. Podés suscribirte fácilmente pagando con USDT (cripto) o por transferencia bancaria (Argentina) acá abajo:
          </p>
          <PagoUSDT
            negocioId={datos.negocioId}
            comprobante={comprobante}
            onEnviado={() => cargarComprobante(datos.negocioId)}
            abiertoPorDefecto
          />
          <PagoTransferenciaARS
            negocioId={datos.negocioId}
            comprobante={comprobante}
            onEnviado={() => cargarComprobante(datos.negocioId)}
          />
        </div>
      )}
      <BotonSalir />
    </main>
  );
}
