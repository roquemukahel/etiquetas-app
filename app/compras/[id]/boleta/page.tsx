'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { simboloMoneda } from '../../../lib/monedas';
import { ESLOGAN } from '../../../lib/eslogan';
import EtiquetaSeccion from '../../../EtiquetaSeccion';

type Compra = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  detalles: string | null;
  precio: number | null;
  created_at: string;
  clientes: {
    nombre: string;
    apellido: string | null;
    telefono: string | null;
    email: string | null;
    dni: string | null;
    domicilio: string | null;
  } | null;
};

type Negocio = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
  texto_declaracion_compra: string | null;
  texto_declaracion_compra_tamano: number;
  moneda: string;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function BoletaCompra() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [compra, setCompra] = useState<Compra | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: compraError } = await supabase
        .from('compras')
        .select('*, clientes ( nombre, apellido, telefono, email, dni, domicilio )')
        .eq('id', id)
        .single();
      if (compraError) setError(compraError.message);
      setCompra(data as any);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( nombre, telefono, direccion, eslogan, logo_url, texto_declaracion_compra, texto_declaracion_compra_tamano, moneda )')
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
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!compra) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">No encontramos esa compra.</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href="/compras" className="text-sm text-accent underline">
          Volver a compras
        </Link>
      </main>
    );
  }

  const moneda = simboloMoneda(negocio?.moneda);
  const clienteNombre = compra.clientes ? `${compra.clientes.nombre} ${compra.clientes.apellido || ''}`.trim() : '';

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href="/compras" className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">Boleta de compra</span>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          Imprimir
        </button>
        <Link
          href={`/compras/${compra.id}?editar=1`}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          Editar boleta
        </Link>
        <Link
          href={`/compras/${compra.id}`}
          className="rounded-lg bg-accent hover:bg-accent-hover transition-colors text-white px-3 py-2 text-xs font-medium"
        >
          Guardar
        </Link>
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
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{ESLOGAN}</p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt="Logo" className="h-32 w-32 print:h-24 print:w-24 object-contain rounded-lg" />
            )}
            <div>
              <p className="text-2xl print:text-lg font-display font-semibold leading-tight">{negocio?.nombre}</p>
              {negocio?.eslogan && (
                <p className="text-xs text-muted max-w-[260px] leading-snug mt-0.5">{negocio.eslogan}</p>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-muted leading-relaxed">
            <p className="font-medium text-ink">Compra #{compra.id.slice(0, 8)}</p>
            <p>{formatearFecha(compra.created_at)}</p>
          </div>
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8 print:gap-4">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>Negocio (comprador)</EtiquetaSeccion>
            <p className="font-medium">{negocio?.nombre}</p>
            {negocio?.telefono && <p className="text-muted">{negocio.telefono}</p>}
            {negocio?.direccion && <p className="text-muted">{negocio.direccion}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>Cliente (vendedor)</EtiquetaSeccion>
            <p className="font-medium">{clienteNombre}</p>
            {compra.clientes?.telefono && <p className="text-muted">{compra.clientes.telefono}</p>}
            {compra.clientes?.email && <p className="text-muted">{compra.clientes.email}</p>}
            {compra.clientes?.dni && <p className="text-muted">DNI: {compra.clientes.dni}</p>}
            {compra.clientes?.domicilio && <p className="text-muted">{compra.clientes.domicilio}</p>}
          </div>
        </div>

        <Divisor />

        <div className="rounded-xl bg-canvas p-4 print:p-2 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Dispositivo adquirido</p>
          <p className="font-medium">
            {compra.modelo}
            {compra.capacidad_gb ? ` · ${compra.capacidad_gb}GB` : ''}
          </p>
          {compra.imei && (
            <p className="text-muted">
              IMEI: <span className="font-bold text-ink">{compra.imei}</span>
            </p>
          )}
          {compra.detalles && <p className="text-muted">Detalles: {compra.detalles}</p>}
        </div>

        {compra.precio != null && (
          <div className="self-end w-full max-w-[280px] flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5">
            <span className="text-sm font-sans font-medium opacity-80">PRECIO PAGADO</span>
            <span>
              {moneda}
              {compra.precio.toLocaleString('es-AR')}
            </span>
          </div>
        )}

        {negocio?.texto_declaracion_compra && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Declaración</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium print:font-semibold"
              style={{ fontSize: negocio.texto_declaracion_compra_tamano }}
            >
              {negocio.texto_declaracion_compra}
            </p>
          </div>
        )}

        <div className="mt-4 print:mt-2 flex flex-col items-center gap-1 self-center">
          <div className="w-64 border-t border-border" />
          <p className="text-sm text-muted">Firma</p>
          <div className="w-64 border-t border-border mt-4" />
          <p className="text-sm text-muted">Aclaración</p>
          <div className="w-64 border-t border-border mt-4" />
          <p className="text-sm text-muted">DNI</p>
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
