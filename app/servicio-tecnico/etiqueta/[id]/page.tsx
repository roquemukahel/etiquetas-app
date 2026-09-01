'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import EtiquetaServicio from '../../EtiquetaServicio';
import { TAMANOS, type FormatoEtiqueta } from '../../../nueva-etiqueta/Etiqueta';
import { useT } from '../../../lib/idioma';

type Equipo = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  imei: string | null;
  falla_declarada: string | null;
};

export default function EtiquetaServicioTecnico() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const supabase = crearClienteNavegador();

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [logo, setLogoState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [formato, setFormato] = useState<FormatoEtiqueta>('estandar');
  const [imagenParaImprimir, setImagenParaImprimir] = useState<string | null>(null);
  const etiquetaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('reparaciones').select('id, numero_orden, modelo, imei, falla_declarada').eq('id', id).single();
      setEquipo(data as Equipo);
      setLoading(false);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( logo_url )')
        .eq('id', user.id)
        .single();
      setLogoState((perfil as any)?.negocios?.logo_url ?? null);
    })();
  }, [id]);

  const compartirOdescargar = async (blob: Blob, nombreArchivo: string, tipo: string) => {
    const file = new File([blob], nombreArchivo, { type: tipo });
    const puedeCompartir =
      typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] });

    if (puedeCompartir) {
      try {
        await navigator.share({ files: [file], title: t('Etiqueta') });
        return;
      } catch {
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = nombreArchivo;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Captura desde la copia a tamaño real fuera de pantalla (no desde la vista
  // previa reducida), esperando a las fuentes: evita el texto encimado.
  const capturarLienzo = async () => {
    if (!etiquetaRef.current) return null;
    const html2canvas = (await import('html2canvas')).default;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await (document as any).fonts.ready;
      } catch {
        /* sin soporte de Font Loading API */
      }
    }
    return html2canvas(etiquetaRef.current, { scale: 3, backgroundColor: '#ffffff' });
  };

  const descargarPNG = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const canvas = await capturarLienzo();
      if (!canvas) return;
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) await compartirOdescargar(blob, `servicio-${equipo?.id.slice(0, 8) || 'etiqueta'}.png`, 'image/png');
    } finally {
      setDescargando(false);
    }
  };

  const descargarPDF = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const canvas = await capturarLienzo();
      if (!canvas) return;
      const img = canvas.toDataURL('image/png');
      const { wCm, hCm } = TAMANOS[formato];
      const pdf = new jsPDF({ unit: 'cm', format: [wCm, hCm], orientation: wCm >= hCm ? 'landscape' : 'portrait' });
      pdf.addImage(img, 'PNG', 0, 0, wCm, hCm);
      const blob = pdf.output('blob');
      await compartirOdescargar(blob, `servicio-${equipo?.id.slice(0, 8) || 'etiqueta'}.pdf`, 'application/pdf');
    } finally {
      setDescargando(false);
    }
  };

  // Imprimir directo — mismo criterio que app/nueva-etiqueta/page.tsx: se
  // rasteriza a imagen (el div está en píxeles pensados para html2canvas, no
  // para tamaño físico en pantalla) y se imprime esa imagen sola, en una
  // página del tamaño físico exacto.
  const imprimirEtiqueta = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const canvas = await capturarLienzo();
      if (!canvas) return;
      setImagenParaImprimir(canvas.toDataURL('image/png'));
    } finally {
      setDescargando(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!equipo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos ese equipo.')}</p>
        <Link href="/servicio-tecnico" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Servicio Técnico')}
        </Link>
      </main>
    );
  }

  const identificador = equipo.imei ? `IMEI: ${equipo.imei}` : equipo.numero_orden || `Ticket #${equipo.id.slice(0, 8).toUpperCase()}`;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 items-center">
      <header className="no-print w-full flex items-center gap-3">
        <Link href="/servicio-tecnico" aria-label={t('Volver')} className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Etiqueta del equipo')}</span>
      </header>

      <div className="no-print w-full">
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Tamaño de la etiqueta')}</label>
        <div className="flex gap-2">
          {(Object.keys(TAMANOS) as FormatoEtiqueta[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormato(f)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                formato === f
                  ? 'bg-accent dark:bg-dark-accent text-white'
                  : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {t(TAMANOS[f].label)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">{t(TAMANOS[formato].ayuda)}</p>
      </div>

      {/* Vista previa reducida (solo para mostrar; NO se captura desde acá) */}
      <div
        className="no-print"
        style={{
          width: `${TAMANOS[formato].wPx * (288 / TAMANOS[formato].wPx)}px`,
          height: `${TAMANOS[formato].hPx * (288 / TAMANOS[formato].wPx)}px`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          borderRadius: formato === 'estandar' ? '8px' : '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            transform: `scale(${288 / TAMANOS[formato].wPx})`,
            transformOrigin: 'top left',
            width: `${TAMANOS[formato].wPx}px`,
            height: `${TAMANOS[formato].hPx}px`,
          }}
        >
          <EtiquetaServicio logo={logo} modelo={equipo.modelo} identificador={identificador} detalle={equipo.falla_declarada} formato={formato} />
        </div>
      </div>

      {/* Copia a tamaño real fuera de pantalla: la que captura html2canvas
          (para PNG/PDF/Imprimir) — nunca se imprime directo. */}
      <div aria-hidden className="no-print" style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}>
        <EtiquetaServicio ref={etiquetaRef} logo={logo} modelo={equipo.modelo} identificador={identificador} detalle={equipo.falla_declarada} formato={formato} />
      </div>

      {/* Lo único que se imprime: la imagen ya rasterizada, a tamaño físico exacto. */}
      {imagenParaImprimir && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagenParaImprimir}
          alt=""
          className="hidden print:block"
          style={{ width: `${TAMANOS[formato].wCm}cm`, height: `${TAMANOS[formato].hCm}cm` }}
          onLoad={() => {
            window.print();
            setImagenParaImprimir(null);
          }}
        />
      )}

      {!logo && (
        <Link href="/configuracion/negocio" className="no-print text-sm text-accent dark:text-dark-accent underline -mt-6">
          {t('Subir el logo de tu negocio en Configuración')}
        </Link>
      )}

      <div className="no-print w-full flex flex-col gap-3 mt-auto">
        <button
          onClick={imprimirEtiqueta}
          disabled={descargando}
          className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          🖨️ {t('Imprimir')}
        </button>
        <button
          onClick={descargarPNG}
          disabled={descargando}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-4 text-center text-base font-medium"
        >
          {t('Guardar / compartir PNG')}
        </button>
        <button
          onClick={descargarPDF}
          disabled={descargando}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-4 text-center text-base font-medium"
        >
          {t('Guardar / compartir PDF')}
        </button>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          @page {
            size: ${TAMANOS[formato].wCm}cm ${TAMANOS[formato].hCm}cm;
            margin: 0;
          }
        }
      `}</style>
    </main>
  );
}
