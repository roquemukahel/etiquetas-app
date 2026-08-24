'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../../lib/supabase/client';
import { ESLOGAN } from '../../../../lib/eslogan';
import EtiquetaSeccion from '../../../../EtiquetaSeccion';
import { armarLinkWhatsApp, mensajeComprobantePlanAhorro } from '../../../../lib/whatsapp';
import { codigoLlamada } from '../../../../lib/paises';
import { useT, useIdioma } from '../../../../lib/idioma';
import { localeDe } from '../../../../lib/i18n/traducir';

type Movimiento = {
  id: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
  registrado_por_nombre: string | null;
  anulado: boolean;
  token_publico: string;
};

type Plan = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  monto_objetivo: number;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

type Negocio = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
  texto_declaracion_plan_ahorro: string | null;
  texto_declaracion_plan_ahorro_tamano: number;
};

function formatearFecha(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale);
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function ComprobantePlanAhorro() {
  const { id, movId } = useParams<{ id: string; movId: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const [totalPagado, setTotalPagado] = useState(0);
  // Si esta consulta falla, NO hay que mostrar "$0 juntado" — un cliente
  // que ya venía pagando vería su progreso borrado por un error de red,
  // no porque de verdad no haya pagado nada.
  const [totalPagadoError, setTotalPagadoError] = useState(false);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codigoPais, setCodigoPais] = useState('54');

  useEffect(() => {
    (async () => {
      const [{ data: planData }, { data: mov, error: movError }, { data: todosMov, error: todosMovError }] = await Promise.all([
        supabase.from('planes_ahorro').select('id, modelo, capacidad_gb, color, monto_objetivo, clientes ( nombre, apellido, telefono )').eq('id', id).maybeSingle(),
        supabase
          .from('plan_ahorro_movimientos')
          .select('id, monto, medio, observacion, fecha, registrado_por_nombre, anulado, token_publico')
          .eq('id', movId)
          .single(),
        supabase.from('plan_ahorro_movimientos').select('monto').eq('plan_id', id).eq('anulado', false),
      ]);
      if (movError) setError(movError.message);
      setPlan((planData as any) ?? null);
      setMovimiento((mov as Movimiento) ?? null);
      setTotalPagadoError(!!todosMovError);
      setTotalPagado(todosMovError ? 0 : ((todosMov as { monto: number }[]) ?? []).reduce((acc, m) => acc + m.monto, 0));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select(
            'negocios ( nombre, telefono, direccion, eslogan, logo_url, texto_declaracion_plan_ahorro, texto_declaracion_plan_ahorro_tamano, pais )'
          )
          .eq('id', user.id)
          .single();
        setNegocio((perfil as any)?.negocios ?? null);
        setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
      }
      setLoading(false);
    })();
  }, [id, movId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!movimiento || !plan) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">{t('No encontramos ese comprobante.')}</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href={`/plan-ahorro/${id}`} className="text-sm text-accent underline">
          {t('Volver al plan')}
        </Link>
      </main>
    );
  }

  const falta = Math.max(0, plan.monto_objetivo - totalPagado);
  const completo = totalPagado >= plan.monto_objetivo;
  const clienteNombre = plan.clientes ? `${plan.clientes.nombre} ${plan.clientes.apellido || ''}`.trim() : '';

  const linkWhatsApp = plan.clientes?.telefono
    ? armarLinkWhatsApp(
        plan.clientes.telefono,
        mensajeComprobantePlanAhorro(
          clienteNombre || t('estimado/a'),
          `$${Math.round(movimiento.monto).toLocaleString(locale)}`,
          plan.modelo || t('tu equipo'),
          `${typeof window !== 'undefined' ? window.location.origin : ''}/comprobante-plan-ahorro/${movimiento.token_publico}`,
          t
        ),
        codigoPais
      )
    : null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href={`/plan-ahorro/${id}`} className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">{t('Comprobante de pago')}</span>
        {linkWhatsApp && (
          <a
            href={linkWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-good/30 text-good bg-white dark:bg-dark-surface px-3 py-2 text-xs font-medium hover:bg-good/10 transition-colors"
          >
            {t('Enviar por WhatsApp')}
          </a>
        )}
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          {t('Imprimir')}
        </button>
      </header>

      <div
        id="boleta"
        className="flex flex-col gap-6 print:gap-3 text-[15px] text-ink bg-white rounded-2xl border border-border shadow-card px-8 pt-2 pb-8 print:px-3 print:pt-0.5 print:pb-3 print:rounded-none"
      >
        <div className="flex flex-col items-center gap-0 leading-none">
          <div className="flex items-center gap-1 opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-2.5 w-2.5 object-contain" />
            <span className="text-[8px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{t(ESLOGAN)}</p>
        </div>

        {movimiento.anulado && (
          <div className="rounded-xl bg-bad/10 border-2 border-bad text-bad text-center py-2 font-display font-semibold tracking-wide">
            ⚠ {t('ESTE PAGO FUE ANULADO — no es válido como comprobante')}
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt={t('Logo')} className="h-32 w-32 print:h-24 print:w-24 object-contain rounded-lg" />
            )}
            <div>
              <p className="text-2xl print:text-lg font-display font-semibold leading-tight">{negocio?.nombre}</p>
              {negocio?.eslogan && <p className="text-xs text-muted max-w-[260px] leading-snug mt-0.5">{negocio.eslogan}</p>}
            </div>
          </div>
          <div className="text-right text-sm text-muted leading-relaxed">
            <p className="font-medium text-ink">{t('Comprobante de pago')}</p>
            <p>{formatearFecha(movimiento.fecha, locale)}</p>
          </div>
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8 print:gap-4">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Negocio')}</EtiquetaSeccion>
            <p className="font-medium">{negocio?.nombre}</p>
            {negocio?.telefono && <p className="text-muted">{negocio.telefono}</p>}
            {negocio?.direccion && <p className="text-muted">{negocio.direccion}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Cliente')}</EtiquetaSeccion>
            <p className="font-medium">{clienteNombre}</p>
            {plan.clientes?.telefono && <p className="text-muted">{plan.clientes.telefono}</p>}
          </div>
        </div>

        <Divisor />

        <div className="rounded-xl bg-canvas p-4 print:p-2 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{t('Plan de ahorro')}</p>
          <p className="font-medium">
            {plan.modelo || t('Equipo a definir')}
            {plan.capacidad_gb ? ` · ${plan.capacidad_gb}GB` : ''}
            {plan.color ? ` · ${plan.color}` : ''}
          </p>
          {movimiento.medio && <p className="text-muted">{t('Medio:')} {movimiento.medio}</p>}
          {movimiento.observacion && <p className="text-muted">{t('Observación:')} {movimiento.observacion}</p>}
          {movimiento.registrado_por_nombre && <p className="text-muted">{t('Registrado por:')} {movimiento.registrado_por_nombre}</p>}
        </div>

        <div className="self-end w-full max-w-[320px] flex flex-col gap-2">
          <div className="flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5">
            <span className="text-sm font-sans font-medium opacity-80">{t('PAGO DE HOY')}</span>
            <span>${Math.round(movimiento.monto).toLocaleString(locale)}</span>
          </div>
          {totalPagadoError ? (
            <p className="text-xs text-bad text-right">{t('No pudimos confirmar el total juntado hasta ahora — no lo tomes de este comprobante.')}</p>
          ) : (
            <>
              <div className="flex justify-between text-sm px-1">
                <span className="text-muted">{t('Total juntado')}</span>
                <span className="font-medium">
                  ${Math.round(totalPagado).toLocaleString(locale)} / ${Math.round(plan.monto_objetivo).toLocaleString(locale)}
                </span>
              </div>
              <div className="flex justify-between text-sm px-1">
                <span className="text-muted">{completo ? t('¡Objetivo completado!') : t('Falta para completar')}</span>
                {!completo && <span className="font-medium">${Math.round(falta).toLocaleString(locale)}</span>}
              </div>
            </>
          )}
        </div>

        {negocio?.texto_declaracion_plan_ahorro && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Términos y condiciones')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium print:font-semibold"
              style={{ fontSize: negocio.texto_declaracion_plan_ahorro_tamano }}
            >
              {negocio.texto_declaracion_plan_ahorro}
            </p>
          </div>
        )}

        <div className="mt-4 print:mt-2 flex flex-col items-center gap-1 self-center">
          <div className="w-64 border-t border-border" />
          <p className="text-sm text-muted">{t('Firma')}</p>
          <div className="w-64 border-t border-border mt-4" />
          <p className="text-sm text-muted">{t('Aclaración')}</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          #boleta {
            border: none !important;
          }
          #boleta * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @page {
            size: A4;
            margin: 0.5cm;
          }
        }
      `}</style>
    </main>
  );
}
