'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';

type Item = { descripcion: string; cantidad: number; precio_unitario: number };

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  estado: string;
  created_at: string;
  fecha_entrega: string | null;
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
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

export default function Boleta() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: ordenData } = await supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono, email, dni, domicilio ), vendedores ( nombre ), orden_items ( descripcion, cantidad, precio_unitario )'
        )
        .eq('id', id)
        .single();
      setOrden(ordenData as any);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( nombre, telefono, direccion, logo_url, texto_garantia )')
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">No encontramos esa orden.</p>
        <Link href="/ordenes" className="text-sm text-accent underline">
          Volver a órdenes
        </Link>
      </main>
    );
  }

  const subtotal = orden.orden_items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
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

      <div id="boleta" className="flex flex-col gap-4 text-sm bg-white rounded-xl border border-black/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt="Logo" className="h-14 w-14 object-contain" />
            )}
            <p className="text-lg font-medium">{negocio?.nombre}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>Orden #{orden.id.slice(0, 8)}</p>
            <p>{formatearFecha(orden.created_at)}</p>
            {orden.fecha_entrega && <p>Entregado: {formatearFecha(orden.fecha_entrega)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-medium border-b border-black/10 pb-1 mb-1">Negocio</p>
            <p>{negocio?.nombre}</p>
            {negocio?.telefono && <p>{negocio.telefono}</p>}
            {negocio?.direccion && <p>{negocio.direccion}</p>}
          </div>
          <div>
            <p className="font-medium border-b border-black/10 pb-1 mb-1">Cliente</p>
            <p>{clienteNombre}</p>
            {orden.clientes?.telefono && <p>{orden.clientes.telefono}</p>}
            {orden.clientes?.email && <p>{orden.clientes.email}</p>}
            {orden.clientes?.dni && <p>DNI: {orden.clientes.dni}</p>}
            {orden.clientes?.domicilio && <p>{orden.clientes.domicilio}</p>}
          </div>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/10 text-left">
              <th className="py-1">Producto</th>
              <th className="py-1 text-center">Cant.</th>
              <th className="py-1 text-right">Precio unit.</th>
              <th className="py-1 text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {orden.orden_items.map((i, idx) => (
              <tr key={idx} className="border-b border-black/5">
                <td className="py-1">{i.descripcion}</td>
                <td className="py-1 text-center">{i.cantidad}</td>
                <td className="py-1 text-right">${i.precio_unitario.toLocaleString('es-AR')}</td>
                <td className="py-1 text-right">${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="self-end w-full max-w-[220px] flex flex-col gap-1 text-xs">
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
          <div className="flex justify-between font-medium text-sm border-t border-black/10 pt-1">
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

        {negocio?.texto_garantia && (
          <div>
            <p className="font-medium border-b border-black/10 pb-1 mb-2">Garantía</p>
            <p className="whitespace-pre-wrap text-xs">{negocio.texto_garantia}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-1 self-center">
          <div className="w-56 border-t border-black/40" />
          <p className="text-xs text-muted">Nombre y firma del cliente</p>
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
