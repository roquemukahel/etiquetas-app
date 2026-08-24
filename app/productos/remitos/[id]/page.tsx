'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { ESLOGAN } from '../../../lib/eslogan';
import { armarLinkWhatsApp } from '../../../lib/whatsapp';
import EtiquetaSeccion from '../../../EtiquetaSeccion';
import { useT, useIdioma } from '../../../lib/idioma';
import { localeDe } from '../../../lib/i18n/traducir';

type Remito = {
  id: string;
  numero: string | null;
  sucursal_origen_id: string;
  sucursal_destino_id: string;
  fecha: string;
  observaciones: string | null;
  usuario: string | null;
};

type Item = {
  nombre_snapshot: string;
  marca_snapshot: string | null;
  tipo_item: string;
  cantidad: number;
};

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

// Comprobante imprimible/compartible del Remito Interno — mismo criterio
// visual y de idioma que las boletas de venta (window.print() + WhatsApp
// con el texto ya armado). A diferencia de una boleta, es un documento
// INTERNO entre dos sucursales del mismo negocio, no algo que se le
// entrega a un cliente externo — por eso comparte el contenido como texto
// directo por WhatsApp en vez de generar un link público con token.
export default function ComprobanteRemitoInterno() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);

  const [remito, setRemito] = useState<Remito | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [nombresSucursal, setNombresSucursal] = useState<Map<string, string>>(new Map());
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: remitoData, error: remitoError } = await supabase
        .from('remitos_internos')
        .select('id, numero, sucursal_origen_id, sucursal_destino_id, fecha, observaciones, usuario')
        .eq('id', id)
        .single();
      if (remitoError) setError(remitoError.message);
      setRemito((remitoData as Remito) ?? null);

      const { data: itemsData } = await supabase
        .from('remito_internos_items')
        .select('nombre_snapshot, marca_snapshot, tipo_item, cantidad')
        .eq('remito_id', id);
      setItems((itemsData as Item[]) ?? []);

      const { data: sucursalesData } = await supabase.from('sucursales').select('id, nombre');
      setNombresSucursal(new Map(((sucursalesData as { id: string; nombre: string }[]) ?? []).map((s) => [s.id, s.nombre])));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( nombre, telefono, direccion, eslogan, logo_url )')
          .eq('id', user.id)
          .single();
        setNegocio((perfil as any)?.negocios ?? null);
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!remito) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">{t('No encontramos ese remito.')}</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href="/productos/remitos" className="text-sm text-accent underline">
          {t('Ver remitos')}
        </Link>
      </main>
    );
  }

  const nombreOrigen = nombresSucursal.get(remito.sucursal_origen_id) ?? '—';
  const nombreDestino = nombresSucursal.get(remito.sucursal_destino_id) ?? '—';

  const mensajeWhatsapp =
    `${t('Remito interno')} ${remito.numero ?? ''}\n` +
    `${nombreOrigen} → ${nombreDestino}\n` +
    `${formatearFecha(remito.fecha, locale)}\n\n` +
    items.map((i) => `- ${i.nombre_snapshot}${i.marca_snapshot ? ` (${i.marca_snapshot})` : ''} x${i.cantidad}`).join('\n') +
    (remito.observaciones ? `\n\n${t('Observaciones')}: ${remito.observaciones}` : '');
  const linkWhatsapp = armarLinkWhatsApp(null, mensajeWhatsapp);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href="/productos/remitos" className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">{t('Remito interno')}</span>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          {t('Imprimir')}
        </button>
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-good text-white px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
        >
          WhatsApp
        </a>
      </header>

      <div
        id="remito"
        className="w-full max-w-xl mx-auto flex flex-col gap-6 print:gap-3 text-[15px] text-ink bg-white rounded-2xl border border-border shadow-card px-8 pt-2 pb-8 print:px-3 print:pt-0.5 print:pb-3 print:rounded-none"
      >
        <div className="flex flex-col items-center gap-0 leading-none">
          <div className="flex items-center gap-1 opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-2.5 w-2.5 object-contain" />
            <span className="text-[8px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{t(ESLOGAN)}</p>
        </div>

        <div className="flex items-center gap-3">
          {negocio?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={negocio.logo_url} alt={t('Logo')} className="h-24 w-24 print:h-16 print:w-16 object-contain rounded-lg" />
          )}
          <div>
            <p className="text-2xl print:text-lg font-display font-semibold leading-tight">{negocio?.nombre}</p>
            {negocio?.eslogan && <p className="text-xs text-muted max-w-[280px] leading-snug mt-0.5">{negocio.eslogan}</p>}
          </div>
        </div>

        <div className="text-sm text-muted leading-relaxed">
          <p className="font-medium text-ink">{remito.numero ?? ''}</p>
          <p>{formatearFecha(remito.fecha, locale)}</p>
          {remito.usuario && <p>{t('Generado por')} {remito.usuario}</p>}
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8 print:gap-4">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Sucursal origen')}</EtiquetaSeccion>
            <p className="font-medium">{nombreOrigen}</p>
          </div>
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Sucursal destino')}</EtiquetaSeccion>
            <p className="font-medium">{nombreDestino}</p>
          </div>
        </div>

        <Divisor />

        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-ink text-white text-left text-xs font-semibold uppercase tracking-wide">
              <th className="py-1.5 px-3 rounded-l-lg">{t('Producto')}</th>
              <th className="py-1.5 px-3 text-right rounded-r-lg border-l border-white/20">{t('Cant.')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-canvas' : ''}>
                <td className="py-2.5 print:py-1 px-3">
                  {i.nombre_snapshot}
                  {i.marca_snapshot ? ` · ${i.marca_snapshot}` : ''}
                </td>
                <td className="py-2.5 print:py-1 px-3 text-right font-medium border-l border-border">{i.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {remito.observaciones && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Observaciones')}</p>
            <p className="whitespace-pre-wrap text-muted">{remito.observaciones}</p>
          </div>
        )}

        <div className="mt-4 print:mt-2 flex flex-col items-center gap-1 self-center">
          <div className="w-56 border-t border-border" />
          <p className="text-sm text-muted">{t('Recibido por')}</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          #remito {
            border: none !important;
          }
          #remito * {
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
