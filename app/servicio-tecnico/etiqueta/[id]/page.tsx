'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import EtiquetaServicio from '../../EtiquetaServicio';

type Equipo = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  imei: string | null;
  falla_declarada: string | null;
};

export default function EtiquetaServicioTecnico() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [logo, setLogoState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [descargando, setDescargando] = useState(false);
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
        await navigator.share({ files: [file], title: 'Etiqueta' });
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

  const descargarPNG = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(etiquetaRef.current, { scale: 2 });
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
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(etiquetaRef.current, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'cm', format: [5, 3] });
      pdf.addImage(img, 'PNG', 0, 0, 5, 3);
      const blob = pdf.output('blob');
      await compartirOdescargar(blob, `servicio-${equipo?.id.slice(0, 8) || 'etiqueta'}.pdf`, 'application/pdf');
    } finally {
      setDescargando(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!equipo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese equipo.</p>
        <Link href="/servicio-tecnico" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a Servicio Técnico
        </Link>
      </main>
    );
  }

  const identificador = equipo.imei ? `IMEI: ${equipo.imei}` : equipo.numero_orden || `Ticket #${equipo.id.slice(0, 8).toUpperCase()}`;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 items-center">
      <header className="w-full flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Etiqueta del equipo</span>
      </header>

      <div style={{ transform: 'scale(0.5)', transformOrigin: 'top center', height: '177px' }}>
        <EtiquetaServicio ref={etiquetaRef} logo={logo} modelo={equipo.modelo} identificador={identificador} detalle={equipo.falla_declarada} />
      </div>

      {!logo && (
        <Link href="/configuracion/negocio" className="text-sm text-accent dark:text-dark-accent underline -mt-6">
          Subir el logo de tu negocio en Configuración
        </Link>
      )}

      <div className="w-full flex flex-col gap-3 mt-auto">
        <button
          onClick={descargarPNG}
          disabled={descargando}
          className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          Guardar / compartir PNG
        </button>
        <button
          onClick={descargarPDF}
          disabled={descargando}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-4 text-center text-base font-medium"
        >
          Guardar / compartir PDF
        </button>
      </div>
    </main>
  );
}
