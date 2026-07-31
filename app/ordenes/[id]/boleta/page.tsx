'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { simboloMoneda } from '../../../lib/monedas';
import { ESLOGAN } from '../../../lib/eslogan';
import { armarLinkWhatsApp } from '../../../lib/whatsapp';
import { codigoLlamada } from '../../../lib/paises';
import EtiquetaSeccion from '../../../EtiquetaSeccion';

type Item = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tipo: string;
  dispositivos: { garantia_vencimiento: string | null } | null;
};

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  monto_canje: number | null;
  estado: string;
  created_at: string;
  fecha_entrega: string | null;
  nota: string | null;
  incluir_garantia: boolean;
  token_boleta: string;
  canjes: {
    modelo: string | null;
    capacidad_gb: number | null;
    color: string | null;
    imei: string | null;
    salud_bateria: number | null;
    detalles: string | null;
    monto: number | null;
    vendedores: { nombre: string } | null;
  } | null;
  clientes: {
    nombre: string;
    apellido: string | null;
    telefono: string | null;
    email: string | null;
    dni: string | null;
    domicilio: string | null;
  } | null;
  vendedores: { nombre: string } | null;
  orden_items: Item[];
};

type Negocio = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
  texto_garantia: string | null;
  texto_garantia_servicio: string | null;
  texto_garantia_tamano: number;
  texto_garantia_servicio_tamano: number;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  mostrar_instagram: boolean;
  mostrar_facebook: boolean;
  mostrar_tiktok: boolean;
  moneda: string;
  pais: string;
};

function IconoInstagram() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconoFacebook() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 13.5h2.5l.5-3H14V8.5c0-.9.25-1.5 1.6-1.5H17V4.3c-.28-.04-1.25-.12-2.37-.12-2.35 0-3.96 1.4-3.96 4V10.5H8v3h2.67V21h3.33v-7.5Z" />
    </svg>
  );
}

function IconoTiktok() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.5 3h2.2c.2 1.6 1.3 2.9 3.3 3.1v2.4c-1.2 0-2.4-.4-3.3-1.1v6.4a4.6 4.6 0 1 1-4-4.6v2.3a2.3 2.3 0 1 0 1.8 2.3V3Z" />
    </svg>
  );
}

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function Boleta() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: ordenData, error: ordenError } = await supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono, email, dni, domicilio ), vendedores ( nombre ), canjes!canje_id ( modelo, capacidad_gb, color, imei, salud_bateria, detalles, monto, vendedores ( nombre ) ), orden_items ( descripcion, cantidad, precio_unitario, tipo, dispositivos ( garantia_vencimiento ) )'
        )
        .eq('id', id)
        .single();
      if (ordenError) setError(ordenError.message);
      setOrden(ordenData as any);

      if (ordenData) {
        const url = `${window.location.origin}/boleta/${(ordenData as any).token_boleta}`;
        QRCode.toDataURL(url, { margin: 0, width: 200 }).then(setQr).catch(() => setQr(null));
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select(
            'negocios ( nombre, telefono, direccion, eslogan, logo_url, texto_garantia, texto_garantia_servicio, texto_garantia_tamano, texto_garantia_servicio_tamano, instagram, facebook, tiktok, mostrar_instagram, mostrar_facebook, mostrar_tiktok, moneda, pais )'
          )
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

  if (!orden) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">No encontramos esa orden.</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href="/ordenes" className="text-sm text-accent underline">
          Volver a órdenes
        </Link>
      </main>
    );
  }

  const subtotal = orden.orden_items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const tieneTrabajos = orden.orden_items.some((i) => i.tipo === 'trabajo');
  const tieneProductos = orden.orden_items.some((i) => i.tipo !== 'trabajo');
  const clienteNombre = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : '';
  const moneda = simboloMoneda(negocio?.moneda);

  const mensajeWhatsapp =
    `Hola ${orden.clientes?.nombre || ''}! Te paso la boleta de tu compra en ${negocio?.nombre || ''}.\n` +
    orden.orden_items.map((i) => `- ${i.descripcion} x${i.cantidad}: ${moneda}${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}`).join('\n') +
    `\nTotal: ${moneda}${(orden.total ?? subtotal).toLocaleString('es-AR')}`;
  const linkWhatsapp = orden.clientes?.telefono
    ? armarLinkWhatsApp(orden.clientes.telefono, mensajeWhatsapp, codigoLlamada(negocio?.pais))
    : null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href="/ordenes" className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">Boleta</span>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          Imprimir
        </button>
        {linkWhatsapp && (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-good text-white px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            WhatsApp
          </a>
        )}
        <Link
          href="/ordenes"
          className="rounded-lg bg-accent hover:bg-accent-hover transition-colors text-white px-3 py-2 text-xs font-medium"
        >
          Guardar
        </Link>
      </header>

      <div
        id="boleta"
        className="flex flex-col gap-6 print:gap-3 text-[15px] text-ink bg-white rounded-2xl border border-border shadow-card p-8 print:p-4"
      >
        <div className="flex flex-col items-center gap-0.5 -mb-2 print:-mb-1">
          <div className="flex items-center gap-1.5 opacity-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-4 w-4 object-contain" />
            <span className="text-[11px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[10px] text-muted text-center max-w-xs leading-snug">{ESLOGAN}</p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt="Logo" className="h-16 w-16 print:h-10 print:w-10 object-contain rounded-lg" />
            )}
            <div>
              <p className="text-2xl print:text-lg font-display font-semibold leading-tight">{negocio?.nombre}</p>
              {negocio?.eslogan && (
                <p className="text-xs text-muted max-w-[260px] leading-snug mt-0.5">{negocio.eslogan}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right text-sm text-muted leading-relaxed">
              <p className="font-medium text-ink">Orden #{orden.id.slice(0, 8)}</p>
              <p>{formatearFecha(orden.created_at)}</p>
              {orden.fecha_entrega && <p>Entregado: {formatearFecha(orden.fecha_entrega)}</p>}
            </div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Código QR de la boleta" className="h-16 w-16 print:h-14 print:w-14 shrink-0" />
            )}
          </div>
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8 print:gap-4">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>Negocio</EtiquetaSeccion>
            <p className="font-medium">{negocio?.nombre}</p>
            {negocio?.telefono && <p className="text-muted">{negocio.telefono}</p>}
            {negocio?.direccion && <p className="text-muted">{negocio.direccion}</p>}
            {(negocio?.mostrar_instagram || negocio?.mostrar_facebook || negocio?.mostrar_tiktok) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-muted">
                {negocio.mostrar_instagram && negocio.instagram && (
                  <span className="flex items-center gap-1.5">
                    <IconoInstagram /> {negocio.instagram}
                  </span>
                )}
                {negocio.mostrar_facebook && negocio.facebook && (
                  <span className="flex items-center gap-1.5">
                    <IconoFacebook /> {negocio.facebook}
                  </span>
                )}
                {negocio.mostrar_tiktok && negocio.tiktok && (
                  <span className="flex items-center gap-1.5">
                    <IconoTiktok /> {negocio.tiktok}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>Cliente</EtiquetaSeccion>
            <p className="font-medium">{clienteNombre}</p>
            {orden.clientes?.telefono && <p className="text-muted">{orden.clientes.telefono}</p>}
            {orden.clientes?.email && <p className="text-muted">{orden.clientes.email}</p>}
            {orden.clientes?.dni && <p className="text-muted">DNI: {orden.clientes.dni}</p>}
            {orden.clientes?.domicilio && <p className="text-muted">{orden.clientes.domicilio}</p>}
          </div>
        </div>

        {orden.canjes && (
          <div className="rounded-xl bg-accent-soft p-4 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">
              Plan canje — dispositivo entregado
            </p>
            <p className="font-medium">
              {orden.canjes.modelo}
              {orden.canjes.capacidad_gb ? ` · ${orden.canjes.capacidad_gb}GB` : ''}
              {orden.canjes.color ? ` · ${orden.canjes.color}` : ''}
            </p>
            {orden.canjes.imei && (
              <p className="text-muted">
                IMEI: <span className="font-bold text-ink">{orden.canjes.imei}</span>
              </p>
            )}
            {orden.canjes.salud_bateria != null && <p className="text-muted">Batería: {orden.canjes.salud_bateria}%</p>}
            {orden.canjes.detalles && <p className="text-muted">Detalles: {orden.canjes.detalles}</p>}
            {orden.canjes.vendedores?.nombre && (
              <p className="text-muted">Recibido por: {orden.canjes.vendedores.nombre}</p>
            )}
            {orden.canjes.monto != null && (
              <p className="font-medium mt-1">
                Monto reconocido: {moneda}
                {orden.canjes.monto.toLocaleString('es-AR')}
              </p>
            )}
          </div>
        )}

        <Divisor />

        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-ink text-white text-left text-xs font-semibold uppercase tracking-wide">
              <th className="py-2 px-3 rounded-l-lg">Producto</th>
              <th className="py-2 px-3 text-center">Cant.</th>
              <th className="py-2 px-3 text-right">Precio unit.</th>
              <th className="py-2 px-3 text-right rounded-r-lg">Precio</th>
            </tr>
          </thead>
          <tbody>
            {orden.orden_items.map((i, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-canvas' : ''}>
                <td className="py-2.5 print:py-1 px-3">
                  {i.descripcion}
                  {i.dispositivos?.garantia_vencimiento && (
                    <p className="text-xs text-muted mt-0.5">
                      🛡️ Garantía hasta el {new Date(i.dispositivos.garantia_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}
                    </p>
                  )}
                </td>
                <td className="py-2.5 print:py-1 px-3 text-center">{i.cantidad}</td>
                <td className="py-2.5 print:py-1 px-3 text-right">
                  {moneda}
                  {i.precio_unitario.toLocaleString('es-AR')}
                </td>
                <td className="py-2.5 print:py-1 px-3 text-right font-medium">
                  {moneda}
                  {(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="self-end w-full max-w-[280px] flex flex-col gap-2 text-sm">
          {orden.anticipo != null && orden.anticipo > 0 && (
            <div className="flex justify-between text-muted">
              <span>Anticipo</span>
              <span>
                {moneda}
                {orden.anticipo.toLocaleString('es-AR')}
              </span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span>
              {moneda}
              {subtotal.toLocaleString('es-AR')}
            </span>
          </div>
          {orden.impuesto_porcentaje != null && orden.impuesto_porcentaje > 0 && (
            <div className="flex justify-between text-muted">
              <span>Impuesto</span>
              <span>{orden.impuesto_porcentaje}%</span>
            </div>
          )}
          {orden.monto_canje != null && orden.monto_canje > 0 && (
            <div className="flex justify-between text-muted">
              <span>Plan canje</span>
              <span>
                -{moneda}
                {orden.monto_canje.toLocaleString('es-AR')}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline font-display font-semibold text-xl rounded-lg bg-ink text-white px-3 py-2.5 mt-1">
            <span className="text-sm font-sans font-medium opacity-80">TOTAL</span>
            <span>
              {moneda}
              {(orden.total ?? subtotal).toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p>
            <span className="text-muted">Método de pago </span>
            <span className="font-medium">{orden.forma_pago}</span>
          </p>
          {orden.vendedores?.nombre && (
            <p>
              <span className="text-muted">Vendedor </span>
              <span className="font-medium">{orden.vendedores.nombre}</span>
            </p>
          )}
        </div>

        {orden.nota && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Nota</p>
            <p className="whitespace-pre-wrap text-muted">{orden.nota}</p>
          </div>
        )}

        {orden.incluir_garantia && tieneProductos && negocio?.texto_garantia && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Garantía de productos</p>
            <p
              className="whitespace-pre-wrap text-muted"
              style={{ fontSize: negocio.texto_garantia_tamano }}
            >
              {negocio.texto_garantia}
            </p>
          </div>
        )}

        {orden.incluir_garantia && tieneTrabajos && negocio?.texto_garantia_servicio && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Garantía de servicio técnico</p>
            <p
              className="whitespace-pre-wrap text-muted"
              style={{ fontSize: negocio.texto_garantia_servicio_tamano }}
            >
              {negocio.texto_garantia_servicio}
            </p>
          </div>
        )}

        <div className="mt-4 print:mt-2 flex flex-col items-center gap-1 self-center">
          <div className="w-56 border-t border-border" />
          <p className="text-sm text-muted">Nombre y firma del cliente</p>
        </div>

        <Divisor />

        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] text-muted text-center max-w-xs">
            Escaneá el código QR para volver a ver esta boleta cuando quieras.
          </p>
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
            margin: 1.5cm;
          }
        }
      `}</style>
    </main>
  );
}
