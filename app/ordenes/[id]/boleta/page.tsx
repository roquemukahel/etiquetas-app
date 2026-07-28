'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';

type Item = { descripcion: string; cantidad: number; precio_unitario: number; tipo: string };

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
  canjes: {
    modelo: string | null;
    capacidad_gb: number | null;
    color: string | null;
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
  logo_url: string | null;
  texto_garantia: string | null;
  texto_garantia_servicio: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  mostrar_instagram: boolean;
  mostrar_facebook: boolean;
  mostrar_tiktok: boolean;
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

export default function Boleta() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: ordenData, error: ordenError } = await supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono, email, dni, domicilio ), vendedores ( nombre ), canjes!canje_id ( modelo, capacidad_gb, color, salud_bateria, detalles, monto, vendedores ( nombre ) ), orden_items ( descripcion, cantidad, precio_unitario, tipo )'
        )
        .eq('id', id)
        .single();
      if (ordenError) setError(ordenError.message);
      setOrden(ordenData as any);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select(
            'negocios ( nombre, telefono, direccion, logo_url, texto_garantia, texto_garantia_servicio, instagram, facebook, tiktok, mostrar_instagram, mostrar_facebook, mostrar_tiktok )'
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

  const mensajeWhatsapp = encodeURIComponent(
    `Hola ${orden.clientes?.nombre || ''}! Te paso la boleta de tu compra en ${negocio?.nombre || ''}.\n` +
      orden.orden_items.map((i) => `- ${i.descripcion} x${i.cantidad}: $${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}`).join('\n') +
      `\nTotal: $${(orden.total ?? subtotal).toLocaleString('es-AR')}`
  );
  const telefonoLimpio = orden.clientes?.telefono?.replace(/\D/g, '');

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href="/ordenes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Boleta</span>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-black/15 px-3 py-2 text-xs font-medium"
        >
          Imprimir
        </button>
        {telefonoLimpio && (
          <a
            href={`https://wa.me/${telefonoLimpio}?text=${mensajeWhatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-good text-base px-3 py-2 text-xs font-medium"
          >
            WhatsApp
          </a>
        )}
        <Link href="/ordenes" className="rounded-lg bg-ink text-base px-3 py-2 text-xs font-medium">
          Guardar
        </Link>
      </header>

      <div id="boleta" className="flex flex-col gap-5 text-[15px] text-ink bg-white rounded-xl border border-black/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt="Logo" className="h-14 w-14 object-contain" />
            )}
            <p className="text-xl font-medium">{negocio?.nombre}</p>
          </div>
          <div className="text-right text-sm text-muted">
            <p>Orden #{orden.id.slice(0, 8)}</p>
            <p>{formatearFecha(orden.created_at)}</p>
            {orden.fecha_entrega && <p>Entregado: {formatearFecha(orden.fecha_entrega)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-medium border-b-2 border-black/20 pb-1 mb-1">Negocio</p>
            <p>{negocio?.nombre}</p>
            {negocio?.telefono && <p>{negocio.telefono}</p>}
            {negocio?.direccion && <p>{negocio.direccion}</p>}
            {(negocio?.mostrar_instagram || negocio?.mostrar_facebook || negocio?.mostrar_tiktok) && (
              <div className="flex flex-col gap-0.5 mt-1">
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
          <div>
            <p className="font-medium border-b-2 border-black/20 pb-1 mb-1">Cliente</p>
            <p>{clienteNombre}</p>
            {orden.clientes?.telefono && <p>{orden.clientes.telefono}</p>}
            {orden.clientes?.email && <p>{orden.clientes.email}</p>}
            {orden.clientes?.dni && <p>DNI: {orden.clientes.dni}</p>}
            {orden.clientes?.domicilio && <p>{orden.clientes.domicilio}</p>}
          </div>
        </div>

        {orden.canjes && (
          <div className="rounded-lg border-2 border-black/20 p-3">
            <p className="font-medium border-b-2 border-black/20 pb-1 mb-2">Plan canje — dispositivo entregado</p>
            <p>
              {orden.canjes.modelo}
              {orden.canjes.capacidad_gb ? ` · ${orden.canjes.capacidad_gb}GB` : ''}
              {orden.canjes.color ? ` · ${orden.canjes.color}` : ''}
            </p>
            {orden.canjes.salud_bateria != null && <p>Batería: {orden.canjes.salud_bateria}%</p>}
            {orden.canjes.detalles && <p>Detalles: {orden.canjes.detalles}</p>}
            {orden.canjes.vendedores?.nombre && <p>Recibido por: {orden.canjes.vendedores.nombre}</p>}
            {orden.canjes.monto != null && (
              <p className="font-medium mt-1">Monto reconocido: ${orden.canjes.monto.toLocaleString('es-AR')}</p>
            )}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/20 text-left">
              <th className="py-2">Producto</th>
              <th className="py-2 text-center">Cant.</th>
              <th className="py-2 text-right">Precio unit.</th>
              <th className="py-2 text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {orden.orden_items.map((i, idx) => (
              <tr key={idx} className="border-b border-black/10">
                <td className="py-2">{i.descripcion}</td>
                <td className="py-2 text-center">{i.cantidad}</td>
                <td className="py-2 text-right">${i.precio_unitario.toLocaleString('es-AR')}</td>
                <td className="py-2 text-right">${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="self-end w-full max-w-[260px] flex flex-col gap-1 text-sm">
          {orden.anticipo != null && orden.anticipo > 0 && (
            <div className="flex justify-between">
              <span>Anticipo</span>
              <span>${orden.anticipo.toLocaleString('es-AR')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString('es-AR')}</span>
          </div>
          {orden.impuesto_porcentaje != null && orden.impuesto_porcentaje > 0 && (
            <div className="flex justify-between">
              <span>Impuesto %</span>
              <span>{orden.impuesto_porcentaje}%</span>
            </div>
          )}
          {orden.monto_canje != null && orden.monto_canje > 0 && (
            <div className="flex justify-between">
              <span>Plan canje</span>
              <span>-${orden.monto_canje.toLocaleString('es-AR')}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-lg border-t-2 border-black/30 pt-1">
            <span>TOTAL</span>
            <span>${(orden.total ?? subtotal).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <p>
          <span className="font-medium">Método de pago:</span> {orden.forma_pago}
        </p>
        {orden.vendedores?.nombre && (
          <p>
            <span className="font-medium">Vendedor:</span> {orden.vendedores.nombre}
          </p>
        )}

        {tieneProductos && negocio?.texto_garantia && (
          <div>
            <p className="font-medium border-b-2 border-black/20 pb-1 mb-2">Garantía de productos</p>
            <p className="whitespace-pre-wrap text-sm">{negocio.texto_garantia}</p>
          </div>
        )}

        {tieneTrabajos && negocio?.texto_garantia_servicio && (
          <div>
            <p className="font-medium border-b-2 border-black/20 pb-1 mb-2">Garantía de servicio técnico</p>
            <p className="whitespace-pre-wrap text-sm">{negocio.texto_garantia_servicio}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-1 self-center">
          <div className="w-56 border-t-2 border-black/40" />
          <p className="text-sm text-muted">Nombre y firma del cliente</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white;
          }
          #boleta {
            border: none !important;
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
