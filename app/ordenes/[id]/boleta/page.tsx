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
import { medioLabel } from '../../../lib/cuentaCorriente';
import { useT, useIdioma } from '../../../lib/idioma';
import { localeDe } from '../../../lib/i18n/traducir';
import { TIPOS_BLOQUEO, type TipoBloqueo } from '../../../lib/reparaciones';
import PatronDesbloqueo from '../../../PatronDesbloqueo';

type Item = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tipo: string;
  dispositivos: { garantia_vencimiento: string | null; estado: string | null } | null;
};

type Orden = {
  id: string;
  numero_orden: string | null;
  forma_pago: string | null;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  monto_canje: number | null;
  cuotas: number | null;
  estado: string;
  created_at: string;
  fecha_entrega: string | null;
  nota: string | null;
  incluir_garantia: boolean;
  token_boleta: string;
  moneda: string | null;
  monto_secundario: number | null;
  moneda_secundaria: string | null;
  boleta_moneda: string | null;
  aclaraciones_tecnico: string | null;
  incluir_aclaraciones_tecnico: boolean;
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

type BloqueoEquipo = {
  modelo: string | null;
  tipo_bloqueo: TipoBloqueo | null;
  codigo_desbloqueo: string | null;
  patron_desbloqueo: string | null;
};

type CanjeEntregado = {
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
  vendedores: { nombre: string } | null;
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

function formatearFecha(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale);
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full print:h-[2px]" />;
}

export default function Boleta() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);

  const [orden, setOrden] = useState<Orden | null>(null);
  const [desglosePagos, setDesglosePagos] = useState<{ medio: string; monto: number }[]>([]);
  const [canjes, setCanjes] = useState<CanjeEntregado[]>([]);
  const [bloqueos, setBloqueos] = useState<BloqueoEquipo[]>([]);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: ordenData, error: ordenError } = await supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono, email, dni, domicilio ), vendedores ( nombre ), orden_items ( descripcion, cantidad, precio_unitario, tipo, dispositivos ( garantia_vencimiento, estado ) )'
        )
        .eq('id', id)
        .single();
      if (ordenError) setError(ordenError.message);
      setOrden(ordenData as any);

      const { data: canjesData } = await supabase
        .from('canjes')
        .select('modelo, capacidad_gb, color, imei, salud_bateria, detalles, monto, vendedores ( nombre )')
        .eq('orden_id', id)
        .eq('estado', 'en_canje')
        .order('created_at');
      setCanjes((canjesData as any) ?? []);

      // Solo el bloqueo que el cliente declaró para ESTE recibo — nunca en la
      // boleta pública compartible por link/QR (app/boleta/[token]/page.tsx),
      // solo acá, en la que se imprime en el momento y se entrega en mano.
      const { data: bloqueosData } = await supabase
        .from('reparaciones')
        .select('modelo, tipo_bloqueo, codigo_desbloqueo, patron_desbloqueo')
        .eq('orden_cobro_id', id)
        .not('tipo_bloqueo', 'is', null);
      setBloqueos((bloqueosData as any) ?? []);

      // Desglose real de cómo se pagó — antes la boleta solo mostraba
      // "Efectivo + Cuenta corriente" (la etiqueta armada en forma_pago) sin
      // los montos de cada medio, así que un pago mixto no se podía auditar
      // desde la boleta. `pagos` tiene la plata que entró de contado; lo que
      // quedó a cuenta corriente no genera fila en `pagos` (ver
      // construirPagos() en ordenes/nueva), así que se suma aparte desde
      // cta_cte_movimientos.
      const [{ data: pagosData }, { data: ctaCteData }] = await Promise.all([
        supabase.from('pagos').select('medio, monto').eq('orden_id', id).eq('anulado', false),
        // 'venta' = cargo único (cuenta corriente normal); 'cuota' = cada
        // cuota de "Financiar en cuotas propias" (financiacion_crear_plan) —
        // ambos representan plata de ESTA orden que quedó a cuenta corriente.
        supabase.from('cta_cte_movimientos').select('monto').eq('orden_id', id).in('concepto', ['venta', 'cuota']).eq('anulado', false),
      ]);
      const porMedio = new Map<string, number>();
      for (const p of (pagosData as { medio: string; monto: number }[]) ?? []) {
        porMedio.set(p.medio, (porMedio.get(p.medio) ?? 0) + p.monto);
      }
      const totalCtaCte = ((ctaCteData as { monto: number }[]) ?? []).reduce((acc, m) => acc + m.monto, 0);
      if (totalCtaCte > 0) porMedio.set('cuenta_corriente', (porMedio.get('cuenta_corriente') ?? 0) + totalCtaCte);
      setDesglosePagos(Array.from(porMedio.entries()).map(([medio, monto]) => ({ medio, monto })));

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
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!orden) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">{t('No encontramos esa orden.')}</p>
        {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <Link href="/ordenes" className="text-sm text-accent underline">
          {t('Volver a órdenes')}
        </Link>
      </main>
    );
  }

  const subtotal = orden.orden_items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const tieneTrabajos = orden.orden_items.some((i) => i.tipo === 'trabajo');
  const tieneProductos = orden.orden_items.some((i) => i.tipo !== 'trabajo');
  const clienteNombre = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : '';
  const moneda = simboloMoneda(orden.moneda || negocio?.moneda);
  const totalNum = orden.total ?? subtotal;
  // Cómo mostrar el monto en la boleta (la orden vive en la moneda principal).
  // Compatibilidad: órdenes viejas (sin boleta_moneda) que tenían un monto
  // secundario cargado usaban el viejo "mostrar también" = modo 'ambas'.
  // El modo "solo secundaria" se sacó de la app (convertía cada línea con un
  // factor derivado del total, y esa cuenta podía no cerrar bien apenas
  // había anticipo/canje/cuotas de por medio) — una orden vieja que lo
  // tuviera guardado se muestra igual que 'ambas': todo en la moneda
  // principal + una línea de referencia informativa.
  const modoCrudo = orden.boleta_moneda || (orden.monto_secundario != null ? 'ambas' : 'principal');
  const modo = modoCrudo === 'secundaria' ? 'ambas' : modoCrudo;
  // Monto EXACTO: hasta 2 decimales si los tiene (US$7,64 no se redondea a 8),
  // pero sin forzar ",00" en los enteros (US$470 queda US$470).
  const fmt = (n: number) => moneda + n.toLocaleString(locale, { maximumFractionDigits: 2 });

  // Link público a la boleta (misma que se ve en /boleta/[token]), para que
  // el cliente pueda abrirla y descargarla — antes el mensaje era solo texto
  // y "no llegaba la boleta".
  const urlBoleta = typeof window !== 'undefined' && orden.token_boleta ? `${window.location.origin}/boleta/${orden.token_boleta}` : '';
  const mensajeWhatsapp =
    `${t('Hola')} ${orden.clientes?.nombre || ''}! ${t('Te paso la boleta de tu compra en')} ${negocio?.nombre || ''}.\n` +
    orden.orden_items.map((i) => `- ${i.descripcion} x${i.cantidad}: ${fmt(i.cantidad * i.precio_unitario)}`).join('\n') +
    `\n${t('Total')}: ${fmt(totalNum)}` +
    (orden.cuotas && orden.cuotas > 1
      ? `\n${t('En')} ${orden.cuotas} ${t('cuotas de')} ${fmt(totalNum / orden.cuotas)}`
      : '') +
    (urlBoleta ? `\n\n${t('Podés ver y descargar tu boleta acá:')}\n${urlBoleta}` : '');
  const linkWhatsapp = orden.clientes?.telefono
    ? armarLinkWhatsApp(orden.clientes.telefono, mensajeWhatsapp, codigoLlamada(negocio?.pais))
    : null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 print:p-0 print:gap-0">
      <header className="no-print flex items-center gap-3 flex-wrap">
        <Link href="/ordenes" className="text-2xl leading-none text-ink">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold mr-auto">{t('Boleta')}</span>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          {t('Imprimir')}
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
          href={`/ordenes/${orden.id}?editar=1`}
          className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface text-ink dark:text-dark-text px-3 py-2 text-xs font-medium hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
        >
          {t('Editar boleta')}
        </Link>
        <Link
          href="/ordenes"
          className="rounded-lg bg-accent hover:bg-accent-hover transition-colors text-white px-3 py-2 text-xs font-medium"
        >
          {t('Guardar')}
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
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{t(ESLOGAN)}</p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {negocio?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt={t('Logo')} className="h-32 w-32 print:h-24 print:w-24 object-contain rounded-lg" />
            )}
            <div>
              <p className="text-2xl print:text-lg font-display font-semibold leading-tight">{negocio?.nombre}</p>
              {negocio?.eslogan && (
                <p className="text-xs text-muted max-w-[260px] leading-snug mt-0.5">{negocio.eslogan}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right text-sm text-muted leading-relaxed mt-1">
              <p className="font-medium text-ink">{t('Orden #')}{orden.numero_orden || orden.id.slice(0, 8)}</p>
              <p>{formatearFecha(orden.created_at, locale)}</p>
              {orden.fecha_entrega && <p>{t('Entregado:')} {formatearFecha(orden.fecha_entrega, locale)}</p>}
              <span
                className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  orden.estado === 'entregado'
                    ? 'bg-good/15 text-good'
                    : orden.estado === 'pagado'
                      ? 'bg-accent/15 text-accent'
                      : 'bg-warn/15 text-warn'
                }`}
              >
                {t(orden.estado)}
              </span>
            </div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('Código QR de la boleta')} className="h-20 w-20 print:h-16 print:w-16 shrink-0 -mt-1" />
            )}
          </div>
        </div>

        <Divisor />

        <div className="grid grid-cols-2 gap-8 print:gap-4">
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Negocio')}</EtiquetaSeccion>
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
            <EtiquetaSeccion>{t('Cliente')}</EtiquetaSeccion>
            <p className="font-medium">{clienteNombre}</p>
            {orden.clientes?.telefono && <p className="text-muted">{orden.clientes.telefono}</p>}
            {orden.clientes?.email && <p className="text-muted">{orden.clientes.email}</p>}
            {orden.clientes?.dni && <p className="text-muted">{t('DNI:')} {orden.clientes.dni}</p>}
            {orden.clientes?.domicilio && <p className="text-muted">{orden.clientes.domicilio}</p>}
          </div>
        </div>

        {canjes.length > 0 && (
          <div className="flex flex-col gap-2">
            {canjes.map((c, idx) => (
              <div key={idx} className="rounded-xl bg-accent-soft p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">
                  {t('Plan canje — dispositivo entregado')}{canjes.length > 1 ? ` (${idx + 1} ${t('de')} ${canjes.length})` : ''}
                </p>
                <p className="font-medium">
                  {c.modelo}
                  {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                  {c.color ? ` · ${c.color}` : ''}
                </p>
                {c.imei && (
                  <p className="text-muted">
                    {t('IMEI:')} <span className="font-bold text-ink">{c.imei}</span>
                  </p>
                )}
                {c.salud_bateria != null && <p className="text-muted">{t('Batería:')} {c.salud_bateria}%</p>}
                {c.detalles && <p className="text-muted">{t('Detalles:')} {c.detalles}</p>}
                {c.vendedores?.nombre && <p className="text-muted">{t('Recibido por:')} {c.vendedores.nombre}</p>}
                {c.monto != null && (
                  <p className="font-medium mt-1">
                    {t('Monto reconocido:')} {fmt(c.monto)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {bloqueos.length > 0 && (
          <div className="flex flex-col gap-2">
            {bloqueos.map((b, idx) => (
              <div key={idx} className="rounded-xl bg-accent-soft p-4 flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-0.5">
                  {t('Bloqueo del equipo')}
                  {b.modelo ? ` — ${b.modelo}` : ''}
                  {bloqueos.length > 1 ? ` (${idx + 1} ${t('de')} ${bloqueos.length})` : ''}
                </p>
                <p className="text-muted">
                  {t('Tipo:')} {t(TIPOS_BLOQUEO.find((o) => o.id === b.tipo_bloqueo)?.label ?? '')}
                </p>
                {b.tipo_bloqueo === 'patron' && b.patron_desbloqueo ? (
                  <PatronDesbloqueo value={b.patron_desbloqueo} size={110} />
                ) : (
                  b.codigo_desbloqueo && <p className="font-mono font-bold text-ink">{b.codigo_desbloqueo}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <Divisor />

        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-ink text-white text-left text-xs font-semibold uppercase tracking-wide">
              <th className="py-1.5 px-3 rounded-l-lg">{t('Producto')}</th>
              <th className="py-1.5 px-3 text-center border-l border-white/20">{t('Cant.')}</th>
              <th className="py-1.5 px-3 text-right border-l border-white/20">{t('Precio unit.')}</th>
              <th className="py-1.5 px-3 text-right rounded-r-lg border-l border-white/20">{t('Precio')}</th>
            </tr>
          </thead>
          <tbody>
            {orden.orden_items.map((i, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-canvas' : ''}>
                <td className="py-2.5 print:py-1 px-3">
                  {i.descripcion}
                  {i.dispositivos?.estado === 'sellado' && (
                    <span className="ml-1.5 inline-block text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5 align-middle">
                      ✦ {t('SELLADO')}
                    </span>
                  )}
                  {i.dispositivos?.garantia_vencimiento && (
                    <p className="text-xs text-muted mt-0.5">
                      🛡️ {t('Garantía hasta el')} {new Date(i.dispositivos.garantia_vencimiento + 'T00:00:00').toLocaleDateString(locale)}
                    </p>
                  )}
                </td>
                <td className="py-2.5 print:py-1 px-3 text-center border-l border-border">{i.cantidad}</td>
                <td className="py-2.5 print:py-1 px-3 text-right border-l border-border">
                  {fmt(i.precio_unitario)}
                </td>
                <td className="py-2.5 print:py-1 px-3 text-right font-medium border-l border-border">
                  {fmt(i.cantidad * i.precio_unitario)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="self-end w-full max-w-[280px] flex flex-col gap-2 text-sm">
          {orden.anticipo != null && orden.anticipo > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('Anticipo')}</span>
              <span>{fmt(orden.anticipo)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span>{t('Subtotal')}</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {orden.impuesto_porcentaje != null && orden.impuesto_porcentaje > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('Impuesto')}</span>
              <span>{orden.impuesto_porcentaje}%</span>
            </div>
          )}
          {orden.monto_canje != null && orden.monto_canje > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('Plan canje')}</span>
              <span>-{fmt(orden.monto_canje)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline font-display font-semibold text-lg rounded-lg bg-ink text-white px-3 py-2 mt-1">
            <span className="text-sm font-sans font-medium opacity-80">
              {totalNum < 0 ? t('SALDO A FAVOR DEL CLIENTE') : t('TOTAL')}
            </span>
            <span>
              {totalNum < 0 ? '-' : ''}
              {fmt(Math.abs(totalNum))}
            </span>
          </div>
          {orden.cuotas != null && orden.cuotas > 1 && (
            <div className="flex justify-between text-muted">
              <span>{t('Financiado en')} {orden.cuotas} {t('cuotas')}</span>
              <span>
                {orden.cuotas} × {fmt(totalNum / orden.cuotas)}
              </span>
            </div>
          )}
          {modo === 'ambas' && orden.monto_secundario != null && orden.moneda_secundaria && (
            <p className="text-xs text-muted italic text-right">
              ≈ {simboloMoneda(orden.moneda_secundaria)}
              {orden.monto_secundario.toLocaleString(locale, { maximumFractionDigits: 2 })} {orden.moneda_secundaria} ({t('valor informativo')})
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t('Método de pago')}</span>
          {desglosePagos.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {desglosePagos.map((p) => (
                <div key={p.medio} className="flex justify-between gap-4 max-w-[280px]">
                  <span>{medioLabel(p.medio, t)}</span>
                  <span className="font-medium">{fmt(p.monto)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="font-medium">{orden.forma_pago}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          {orden.vendedores?.nombre && (
            <p>
              <span className="text-muted">{t('Vendedor')} </span>
              <span className="font-medium">{orden.vendedores.nombre}</span>
            </p>
          )}
        </div>

        {orden.nota && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Nota')}</p>
            <p className="whitespace-pre-wrap text-muted">{orden.nota}</p>
          </div>
        )}

        {orden.incluir_aclaraciones_tecnico && orden.aclaraciones_tecnico && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Aclaraciones del técnico')}</p>
            <p className="whitespace-pre-wrap text-muted">{orden.aclaraciones_tecnico}</p>
          </div>
        )}

        {orden.incluir_garantia &&
          ((tieneProductos && negocio?.texto_garantia) || (tieneTrabajos && negocio?.texto_garantia_servicio)) && (
            <Divisor />
          )}

        {orden.incluir_garantia && tieneProductos && negocio?.texto_garantia && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Garantía de productos')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium print:font-semibold"
              style={{ fontSize: negocio.texto_garantia_tamano }}
            >
              {negocio.texto_garantia}
            </p>
          </div>
        )}

        {orden.incluir_garantia && tieneTrabajos && negocio?.texto_garantia_servicio && (
          <div className="rounded-xl bg-canvas p-4 print:p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Garantía de servicio técnico')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium print:font-semibold"
              style={{ fontSize: negocio.texto_garantia_servicio_tamano }}
            >
              {negocio.texto_garantia_servicio}
            </p>
          </div>
        )}

        <div className="mt-4 print:mt-2 flex flex-col items-center gap-1 self-center">
          <div className="w-56 border-t border-border" />
          <p className="text-sm text-muted">{t('Nombre y firma del cliente')}</p>
        </div>

        <Divisor />

        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] text-muted text-center max-w-xs">
            {t('Escaneá el código QR para volver a ver esta boleta cuando quieras.')}
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
            margin: 0.5cm;
          }
        }
      `}</style>
    </main>
  );
}
