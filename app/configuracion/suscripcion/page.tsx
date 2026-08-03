'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import PlanesCheckout from '../../PlanesCheckout';
import PagoUSDT from '../../PagoUSDT';
import PagoTransferenciaARS from '../../PagoTransferenciaARS';

type EstadoSuscripcion = 'trialing' | 'active' | 'past_due' | 'unpaid' | 'cancelled' | 'expired' | 'paused';

type Negocio = {
  id: string;
  estado_suscripcion: EstadoSuscripcion;
  fecha_fin_prueba: string | null;
};

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  estado: string;
  created_at: string;
  nota_admin: string | null;
};

const TEXTOS: Record<EstadoSuscripcion, { titulo: string; detalle: string; color: string }> = {
  trialing: { titulo: 'En período de prueba', detalle: 'Todavía no se te cobró nada.', color: 'text-accent dark:text-dark-accent' },
  active: { titulo: 'Suscripción activa', detalle: 'Todo en orden.', color: 'text-good' },
  past_due: { titulo: 'Pago pendiente', detalle: 'Hubo un problema con el último cobro. Vamos a reintentarlo.', color: 'text-bad' },
  unpaid: { titulo: 'Sin pagar', detalle: 'No se pudo procesar el pago.', color: 'text-bad' },
  cancelled: { titulo: 'Cancelada', detalle: 'Tu suscripción fue cancelada.', color: 'text-bad' },
  expired: { titulo: 'Vencida', detalle: 'Tu suscripción venció.', color: 'text-bad' },
  paused: { titulo: 'Pausada', detalle: 'Tu suscripción está en pausa.', color: 'text-muted' },
};

export default function Suscripcion() {
  const supabase = crearClienteNavegador();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
      setEmail(user.email ?? null);

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( id, estado_suscripcion, fecha_fin_prueba )')
        .eq('id', user.id)
        .single();

      const neg = (perfil as any)?.negocios ?? null;
      setNegocio(neg);
      if (neg) await cargarComprobante(neg.id);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!negocio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos tu negocio.</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          Volver
        </Link>
      </main>
    );
  }

  const info = TEXTOS[negocio.estado_suscripcion] ?? TEXTOS.active;
  const enPrueba = negocio.estado_suscripcion === 'trialing' && negocio.fecha_fin_prueba;
  const necesitaPagar = negocio.estado_suscripcion !== 'active' && negocio.estado_suscripcion !== 'trialing';

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Suscripción</span>
      </header>

      <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col gap-1">
        <span className={`text-base font-medium ${info.color}`}>{info.titulo}</span>
        <span className="text-xs text-muted dark:text-dark-text-secondary">{info.detalle}</span>
        {enPrueba && (
          <span className="text-xs text-muted dark:text-dark-text-secondary mt-2">
            Tu prueba gratis termina el{' '}
            {new Date(negocio.fecha_fin_prueba!).toLocaleDateString('es-AR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            .
          </span>
        )}
      </div>

      {(necesitaPagar || negocio.estado_suscripcion === 'trialing') && (
        <>
          <PlanesCheckout
            negocioId={negocio.id}
            email={email}
            textoBotonMensual={necesitaPagar ? 'Suscribirme — Mensual' : 'Antes de que termine la prueba — Mensual'}
            textoBotonAnual={necesitaPagar ? 'Suscribirme — Anual' : 'Antes de que termine la prueba — Anual'}
          />
          <PagoUSDT negocioId={negocio.id} comprobante={comprobante} onEnviado={() => cargarComprobante(negocio.id)} />
          <PagoTransferenciaARS
            negocioId={negocio.id}
            comprobante={comprobante}
            onEnviado={() => cargarComprobante(negocio.id)}
          />
        </>
      )}
    </main>
  );
}
