'use client';

import { armarLinkCheckout } from './lib/lemonsqueezy';

// Botones de checkout para los dos planes pagos. Los precios son solo texto
// (se muestran acá y en LandingPublica.tsx) — el cobro real y el monto los
// define el producto/variante configurado en Lemon Squeezy. Si cambia el
// precio ahí, hay que actualizar este texto a mano en los dos lugares.
export default function PlanesCheckout({
  negocioId,
  email,
  textoBotonMensual = 'Suscribirme — Mensual',
  textoBotonAnual = 'Suscribirme — Anual',
}: {
  negocioId: string;
  email?: string | null;
  textoBotonMensual?: string;
  textoBotonAnual?: string;
}) {
  const linkMensual = armarLinkCheckout(negocioId, email, 'mensual');
  const linkAnual = armarLinkCheckout(negocioId, email, 'anual');

  if (!linkMensual && !linkAnual) return null;

  return (
    <div className="w-full flex flex-col gap-3">
      {linkMensual && (
        <a
          href={linkMensual}
          className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white"
        >
          {textoBotonMensual}
          <span className="block text-xs font-normal opacity-80">US$9.99/mes</span>
        </a>
      )}
      {linkAnual && (
        <a
          href={linkAnual}
          className="w-full rounded-2xl border-2 border-accent dark:border-dark-accent hover:bg-accent/5 dark:hover:bg-dark-accent/10 transition-colors py-4 text-center text-base font-medium text-accent dark:text-dark-accent"
        >
          {textoBotonAnual}
          <span className="block text-xs font-normal opacity-80">US$100/año</span>
        </a>
      )}
    </div>
  );
}
