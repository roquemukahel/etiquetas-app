'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { simboloMoneda } from '../../lib/monedas';

type Movimiento = {
  tipo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
  observacion: string | null;
  fecha: string;
};

type Cuenta = {
  nombre: string;
  apellido: string | null;
  negocio: string | null;
  logo: string | null;
  moneda: string | null;
  saldo: number;
  movimientos: Movimiento[];
};

export default function PortalCuenta() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('cuenta_publica', { token });
      setCuenta((data as Cuenta) ?? null);
      setLoading(false);
    })();
  }, [token]);

  const moneda = useMemo(() => simboloMoneda(cuenta?.moneda), [cuenta?.moneda]);
  const fmt = (n: number) => `${moneda}${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!cuenta) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-2xl">🔍</p>
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          No encontramos esta cuenta. Revisá el link que te mandaron.
        </p>
      </main>
    );
  }

  const saldo = Number(cuenta.saldo) || 0;
  const debe = saldo > 0.009;
  const aFavor = saldo < -0.009;

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10 gap-6">
      <div className="flex flex-col items-center gap-2">
        {cuenta.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cuenta.logo}
            alt={cuenta.negocio ?? ''}
            className="h-14 w-14 rounded-xl object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card"
          />
        ) : null}
        <p className="text-sm text-muted dark:text-dark-text-secondary">{cuenta.negocio}</p>
      </div>

      <p className="text-base text-center">
        Hola <strong>{cuenta.nombre}</strong>, este es el resumen de tu cuenta:
      </p>

      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-6 flex flex-col items-center gap-1 text-center">
        <p className="text-xs text-muted dark:text-dark-text-secondary uppercase tracking-wide font-semibold">
          {aFavor ? 'Saldo a favor' : 'Saldo actual'}
        </p>
        <p className={`text-4xl font-display font-semibold ${debe ? 'text-bad' : aFavor ? 'text-good' : ''}`}>
          {fmt(saldo)}
        </p>
        <p className="text-sm text-muted dark:text-dark-text-secondary mt-1">
          {debe ? 'Es lo que tenés pendiente de pago.' : aFavor ? 'Tenés saldo a favor.' : '¡Estás al día! Gracias 🙌'}
        </p>
      </div>

      {cuenta.movimientos.length > 0 && (
        <div className="w-full max-w-sm">
          <p className="text-sm font-semibold mb-2">Movimientos</p>
          <div className="flex flex-col gap-2">
            {cuenta.movimientos.map((m, idx) => {
              const esCargo = m.tipo === 'cargo';
              const et =
                m.concepto === 'venta'
                  ? 'Compra'
                  : m.concepto === 'pago'
                  ? 'Pago'
                  : m.concepto === 'nota_credito'
                  ? 'Nota de crédito'
                  : 'Ajuste';
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{et}</p>
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      {new Date(m.fecha).toLocaleDateString('es-AR')}
                    </p>
                    {m.observacion && <p className="text-xs text-muted dark:text-dark-text-secondary truncate">{m.observacion}</p>}
                  </div>
                  <p className={`text-sm font-semibold shrink-0 ${esCargo ? 'text-bad' : 'text-good'}`}>
                    {esCargo ? '+' : '−'}
                    {fmt(m.monto)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted dark:text-dark-text-secondary mt-auto">con Qovento</p>
    </main>
  );
}
