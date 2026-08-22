'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../../lib/supabase/client';
import { ESLOGAN } from '../../../../lib/eslogan';
import EtiquetaSeccion from '../../../../EtiquetaSeccion';
import { useT } from '../../../../lib/idioma';

type Movimiento = {
  id: string;
  tipo: string;
  concepto: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
  registrado_por_nombre: string | null;
  anulado: boolean;
};

type Proveedor = { id: string; nombre: string; telefono: string | null };

type Negocio = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
  texto_declaracion_proveedor: string | null;
  texto_declaracion_proveedor_tamano: number;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function ComprobanteProveedor() {
  const { id, movId } = useParams<{ id: string; movId: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: prov }, { data: mov, error: movError }] = await Promise.all([
        supabase.from('proveedores').select('id, nombre, telefono').eq('id', id).maybeSingle(),
        supabase
          .from('proveedor_movimientos')
          .select('id, tipo, concepto, monto, medio, observacion, fecha, registrado_por_nombre, anulado')
          .eq('id', movId)
          .single(),
      ]);
      if (movError) setError(movError.message);
      setProveedor((prov as Proveedor) ?? null);
      setMovimiento((mov as Movimiento) ?? null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select(
            'negocios ( nombre, telefono, direccion, eslogan, logo_url, texto_declaracion_proveedor, texto_declaracion_proveedor_tamano )'
          )
          .eq('id', user.id)
          .single();
        setNegocio((perfil as any)?.negocios ?? null);
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

  if (!movimiento || !proveedor) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">{t('No encontramos ese comprobante.')}</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href={`/proveedores/${id}`} className="text-sm text-accent underline">
          {t('Volver al proveedor')}
        </Link>
      </main>
    );
  }

  const esPago = movimiento.tipo === 'abono';
  const titulo = esPago ? t('Comprobante de pago') : t('Comprobante de deuda');

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href={`/proveedores/${id}`} className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">{titulo}</span>
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
            <p>{formatearFecha(movimiento.fecha)}</p>
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
            <EtiquetaSeccion>{t('Proveedor')}</EtiquetaSeccion>
            <p className="font-medium">{proveedor.nombre}</p>
            {proveedor.telefono && <p className="text-muted">{proveedor.telefono}</p>}
          </div>
        </div>

        <Divisor />

        <div className="rounded-xl bg-canvas p-4 print:p-2 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{t('Concepto')}</p>
          <p className="font-medium">{esPago ? t('Pago realizado') : t('Deuda registrada')}</p>
          {movimiento.medio && <p className="text-muted">{t('Medio:')} {movimiento.medio}</p>}
          {movimiento.observacion && <p className="text-muted">{t('Observación:')} {movimiento.observacion}</p>}
          {movimiento.registrado_por_nombre && <p className="text-muted">{t('Registrado por:')} {movimiento.registrado_por_nombre}</p>}
        </div>

        <div className="self-end w-full max-w-[280px] flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5">
          <span className="text-sm font-sans font-medium opacity-80">{esPago ? t('MONTO PAGADO') : t('MONTO ADEUDADO')}</span>
          <span>${Math.round(movimiento.monto).toLocaleString('es-AR')}</span>
        </div>

        {negocio?.texto_declaracion_proveedor && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Términos y condiciones')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium print:font-semibold"
              style={{ fontSize: negocio.texto_declaracion_proveedor_tamano }}
            >
              {negocio.texto_declaracion_proveedor}
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
