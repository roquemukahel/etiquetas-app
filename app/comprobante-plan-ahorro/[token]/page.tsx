'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { ESLOGAN } from '../../lib/eslogan';
import EtiquetaSeccion from '../../EtiquetaSeccion';
import { useT } from '../../lib/idioma';

type Comprobante = {
  id: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
  registrado_por_nombre: string | null;
  anulado: boolean;
  plan: { id: string; modelo: string | null; capacidad_gb: number | null; color: string | null; monto_objetivo: number };
  cliente_nombre: string | null;
  negocio: {
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    eslogan: string | null;
    logo_url: string | null;
    texto_declaracion_plan_ahorro: string | null;
    texto_declaracion_plan_ahorro_tamano: number;
  };
  total_pagado: number;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full" />;
}

// Versión pública (sin login) del comprobante de pago de Plan de ahorro —
// para poder mandársela al cliente por WhatsApp. Misma estética que la
// versión interna en /plan-ahorro/[id]/comprobante/[movId].
export default function ComprobantePlanAhorroPublico() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const [c, setC] = useState<Comprobante | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('comprobante_plan_ahorro_publico', { token });
      setC((data as Comprobante) ?? null);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!c) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-2xl">🔍</p>
        <p className="text-sm text-muted">{t('No encontramos este comprobante. Revisá el link.')}</p>
      </main>
    );
  }

  const falta = Math.max(0, c.plan.monto_objetivo - c.total_pagado);
  const completo = c.total_pagado >= c.plan.monto_objetivo;

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10">
      <div className="w-full max-w-xl flex flex-col gap-6 text-[15px] text-ink bg-white rounded-2xl border border-border shadow-card px-8 pt-2 pb-8">
        <div className="flex flex-col items-center gap-0 leading-none">
          <div className="flex items-center gap-1 opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-2.5 w-2.5 object-contain" />
            <span className="text-[8px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{t(ESLOGAN)}</p>
        </div>

        {c.anulado && (
          <div className="rounded-xl bg-bad/10 border-2 border-bad text-bad text-center py-2 font-display font-semibold tracking-wide">
            ⚠ {t('ESTE PAGO FUE ANULADO — no es válido como comprobante')}
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {c.negocio.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.negocio.logo_url} alt={t('Logo')} className="h-32 w-32 object-contain rounded-lg" />
            )}
            <div>
              <p className="text-2xl font-display font-semibold leading-tight">{c.negocio.nombre}</p>
              {c.negocio.eslogan && <p className="text-xs text-muted max-w-[260px] leading-snug mt-0.5">{c.negocio.eslogan}</p>}
            </div>
          </div>
          <div className="text-right text-sm text-muted leading-relaxed">
            <p className="font-medium text-ink">{t('Comprobante de pago')}</p>
            <p>{formatearFecha(c.fecha)}</p>
          </div>
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Negocio')}</EtiquetaSeccion>
            <p className="font-medium">{c.negocio.nombre}</p>
            {c.negocio.telefono && <p className="text-muted">{c.negocio.telefono}</p>}
            {c.negocio.direccion && <p className="text-muted">{c.negocio.direccion}</p>}
          </div>
          {c.cliente_nombre && (
            <div className="flex flex-col gap-1">
              <EtiquetaSeccion>{t('Cliente')}</EtiquetaSeccion>
              <p className="font-medium">{c.cliente_nombre}</p>
            </div>
          )}
        </div>

        <Divisor />

        <div className="rounded-xl bg-canvas p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{t('Plan de ahorro')}</p>
          <p className="font-medium">
            {c.plan.modelo || t('Equipo a definir')}
            {c.plan.capacidad_gb ? ` · ${c.plan.capacidad_gb}GB` : ''}
            {c.plan.color ? ` · ${c.plan.color}` : ''}
          </p>
          {c.medio && <p className="text-muted">{t('Medio:')} {c.medio}</p>}
          {c.observacion && <p className="text-muted">{t('Observación:')} {c.observacion}</p>}
          {c.registrado_por_nombre && <p className="text-muted">{t('Registrado por:')} {c.registrado_por_nombre}</p>}
        </div>

        <div className="self-end w-full max-w-[320px] flex flex-col gap-2">
          <div className="flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5">
            <span className="text-sm font-sans font-medium opacity-80">{t('PAGO DE HOY')}</span>
            <span>${Math.round(c.monto).toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between text-sm px-1">
            <span className="text-muted">{t('Total juntado')}</span>
            <span className="font-medium">
              ${Math.round(c.total_pagado).toLocaleString('es-AR')} / ${Math.round(c.plan.monto_objetivo).toLocaleString('es-AR')}
            </span>
          </div>
          <div className="flex justify-between text-sm px-1">
            <span className="text-muted">{completo ? t('¡Objetivo completado!') : t('Falta para completar')}</span>
            {!completo && <span className="font-medium">${Math.round(falta).toLocaleString('es-AR')}</span>}
          </div>
        </div>

        {c.negocio.texto_declaracion_plan_ahorro && (
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Términos y condiciones')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium"
              style={{ fontSize: c.negocio.texto_declaracion_plan_ahorro_tamano }}
            >
              {c.negocio.texto_declaracion_plan_ahorro}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
