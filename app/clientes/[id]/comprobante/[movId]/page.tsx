'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../../lib/supabase/client';
import { ESLOGAN } from '../../../../lib/eslogan';
import EtiquetaSeccion from '../../../../EtiquetaSeccion';
import { armarLinkWhatsApp, mensajeComprobanteCuentaCorriente } from '../../../../lib/whatsapp';
import { codigoLlamada } from '../../../../lib/paises';
import { useT, useIdioma } from '../../../../lib/idioma';
import { localeDe } from '../../../../lib/i18n/traducir';
import { formatearMonto } from '../../../../lib/numeros';

type Movimiento = {
  id: string;
  tipo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
  observacion: string | null;
  pago_id: string | null;
  anulado: boolean;
  fecha: string;
  registrado_por_nombre: string | null;
};

type Cliente = { id: string; nombre: string; apellido: string | null; telefono: string | null; portal_token: string | null };

type Negocio = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
};

function formatearFecha(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale);
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function ComprobanteCliente() {
  const { id, movId } = useParams<{ id: string; movId: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const [medioPago, setMedioPago] = useState<string | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codigoPais, setCodigoPais] = useState('54');

  useEffect(() => {
    (async () => {
      const [{ data: cli }, { data: mov, error: movError }] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido, telefono, portal_token').eq('id', id).maybeSingle(),
        supabase
          .from('cta_cte_movimientos')
          .select('id, tipo, concepto, monto, vencimiento, observacion, pago_id, anulado, fecha, registrado_por_nombre')
          .eq('id', movId)
          .single(),
      ]);
      if (movError) setError(movError.message);
      setCliente((cli as Cliente) ?? null);
      setMovimiento((mov as Movimiento) ?? null);

      if ((mov as Movimiento | null)?.pago_id) {
        const { data: pago } = await supabase.from('pagos').select('medio').eq('id', (mov as Movimiento).pago_id).maybeSingle();
        setMedioPago((pago as { medio: string } | null)?.medio ?? null);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( nombre, telefono, direccion, eslogan, logo_url, pais )')
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

  if (!movimiento || !cliente) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">{t('No encontramos ese comprobante.')}</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href={`/clientes/${id}`} className="text-sm text-accent underline">
          {t('Volver al cliente')}
        </Link>
      </main>
    );
  }

  const esPago = movimiento.concepto === 'pago';
  const esCargo = movimiento.tipo === 'cargo';
  const clienteNombre = `${cliente.nombre} ${cliente.apellido || ''}`.trim();

  const titulo =
    movimiento.concepto === 'pago'
      ? t('Comprobante de pago')
      : movimiento.concepto === 'nota_credito'
      ? t('Nota de crédito')
      : movimiento.concepto === 'ajuste'
      ? t('Comprobante de ajuste')
      : movimiento.concepto === 'venta'
      ? t('Comprobante de venta')
      : esCargo
      ? t('Comprobante de cargo')
      : t('Comprobante de crédito');

  const conceptoTexto =
    movimiento.concepto === 'pago'
      ? t('Pago recibido')
      : movimiento.concepto === 'nota_credito'
      ? t('Nota de crédito / descuento')
      : movimiento.concepto === 'ajuste'
      ? t('Cargo por ajuste')
      : movimiento.concepto === 'venta'
      ? t('Venta a cuenta corriente')
      : esCargo
      ? t('Cargo en la cuenta')
      : t('Crédito en la cuenta');

  const urlPortal =
    cliente.portal_token && typeof window !== 'undefined' ? `${window.location.origin}/cuenta/${cliente.portal_token}` : null;

  const linkWhatsApp = cliente.telefono
    ? armarLinkWhatsApp(
        cliente.telefono,
        mensajeComprobanteCuentaCorriente(
          clienteNombre || t('estimado/a'),
          `$${formatearMonto(movimiento.monto, locale)}`,
          esPago,
          urlPortal,
          t
        ),
        codigoPais
      )
    : null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href={`/clientes/${id}`} className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">{titulo}</span>
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
            ⚠ {t('ESTE MOVIMIENTO FUE ANULADO — no es válido como comprobante')}
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
            <p className="font-medium text-ink">{titulo}</p>
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
            {cliente.telefono && <p className="text-muted">{cliente.telefono}</p>}
          </div>
        </div>

        <Divisor />

        <div className="rounded-xl bg-canvas p-4 print:p-2 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{t('Concepto')}</p>
          <p className="font-medium">{conceptoTexto}</p>
          {medioPago && <p className="text-muted">{t('Medio:')} {medioPago}</p>}
          {esCargo && movimiento.vencimiento && (
            <p className="text-muted">
              {t('Vencimiento:')} {new Date(movimiento.vencimiento).toLocaleDateString(locale)}
            </p>
          )}
          {movimiento.observacion && <p className="text-muted">{t('Observación:')} {movimiento.observacion}</p>}
          {movimiento.registrado_por_nombre && <p className="text-muted">{t('Registrado por:')} {movimiento.registrado_por_nombre}</p>}
        </div>

        <div className="self-end w-full max-w-[280px] flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5">
          <span className="text-sm font-sans font-medium opacity-80">{esCargo ? t('MONTO ADEUDADO') : t('MONTO ABONADO')}</span>
          <span>${formatearMonto(movimiento.monto, locale)}</span>
        </div>

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
