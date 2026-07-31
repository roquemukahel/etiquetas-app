// Arma el link de pago (checkout) de Lemon Squeezy para un negocio puntual.
// El negocio_id viaja como "custom data" y vuelve en el webhook para saber
// a qué negocio corresponde cada suscripción (ver app/api/webhooks/lemonsqueezy).
export type PlanSuscripcion = 'mensual' | 'anual';

const URL_POR_PLAN: Record<PlanSuscripcion, string | undefined> = {
  mensual: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL,
  anual: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_ANUAL,
};

export function armarLinkCheckout(negocioId: string, email?: string | null, plan: PlanSuscripcion = 'mensual') {
  const base = URL_POR_PLAN[plan];
  if (!base) return null;

  const params = new URLSearchParams();
  params.set('checkout[custom][negocio_id]', negocioId);
  if (email) params.set('checkout[email]', email);

  return `${base}?${params.toString()}`;
}
