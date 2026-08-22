'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { simboloMoneda } from '../../lib/monedas';
import { ESLOGAN } from '../../lib/eslogan';
import EtiquetaSeccion from '../../EtiquetaSeccion';
import { useT } from '../../lib/idioma';

type Item = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tipo: string;
  garantia_vencimiento: string | null;
  estado_dispositivo: string | null;
};

type Boleta = {
  id: string;
  created_at: string;
  fecha_entrega: string | null;
  estado: string;
  forma_pago: string | null;
  monto_secundario: number | null;
  moneda_secundaria: string | null;
  boleta_moneda: string | null;
  aclaraciones_tecnico: string | null;
  incluir_aclaraciones_tecnico: boolean;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  monto_canje: number | null;
  nota: string | null;
  incluir_garantia: boolean;
  moneda: string;
  cliente_nombre: string | null;
  negocio: {
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    eslogan: string | null;
    logo_url: string | null;
    texto_garantia: string | null;
    texto_garantia_tamano: number;
    texto_garantia_servicio: string | null;
    texto_garantia_servicio_tamano: number;
  };
  canjes: {
    modelo: string | null;
    capacidad_gb: number | null;
    color: string | null;
    imei: string | null;
    salud_bateria: number | null;
    detalles: string | null;
    monto: number | null;
  }[];
  items: Item[];
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR');
}

function Divisor() {
  return <div className="h-[3px] bg-ink rounded-full" />;
}

export default function BoletaPublica() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const [boleta, setBoleta] = useState<Boleta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('boleta_publica', { token });
      setBoleta((data as Boleta) ?? null);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!boleta) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-2xl">🔍</p>
        <p className="text-sm text-muted">{t('No encontramos esta boleta. Revisá el link o el código QR.')}</p>
      </main>
    );
  }

  const subtotal = boleta.items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const tieneTrabajos = boleta.items.some((i) => i.tipo === 'trabajo');
  const tieneProductos = boleta.items.some((i) => i.tipo !== 'trabajo');
  const moneda = simboloMoneda(boleta.moneda);
  const totalNum = boleta.total ?? subtotal;
  // Cómo mostrar el monto en la boleta. La orden vive en la moneda principal.
  // Compatibilidad: órdenes viejas (sin boleta_moneda) que tenían un monto
  // secundario cargado usaban el viejo "mostrar también" = modo 'ambas'.
  // El modo "solo secundaria" se sacó de la app (convertía cada línea con un
  // factor derivado del total, y esa cuenta podía no cerrar bien apenas
  // había anticipo/canje/cuotas de por medio) — una orden vieja que lo
  // tuviera guardado se muestra igual que 'ambas': todo en la moneda
  // principal + una línea de referencia informativa.
  const modoCrudo = boleta.boleta_moneda || (boleta.monto_secundario != null ? 'ambas' : 'principal');
  const modo = modoCrudo === 'secundaria' ? 'ambas' : modoCrudo;
  // Monto EXACTO: hasta 2 decimales si los tiene, sin forzar ",00" en enteros.
  const fmt = (n: number) => moneda + n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10">
      <div className="w-full max-w-xl flex flex-col gap-6 text-[15px] text-ink bg-white rounded-2xl border border-border shadow-card px-8 pt-2 pb-8">
        <div className="flex flex-col items-center gap-0 leading-none">
          <div className="flex items-center gap-1 opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-2.5 w-2.5 object-contain" />
            <span className="text-[8px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{t(ESLOGAN)}</p>
        </div>

        <div className="flex items-center gap-3">
          {boleta.negocio.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boleta.negocio.logo_url} alt={t('Logo')} className="h-32 w-32 object-contain rounded-lg" />
          )}
          <div>
            <p className="text-2xl font-display font-semibold leading-tight">{boleta.negocio.nombre}</p>
            {boleta.negocio.eslogan && (
              <p className="text-xs text-muted max-w-[280px] leading-snug mt-0.5">{boleta.negocio.eslogan}</p>
            )}
          </div>
        </div>

        <div className="text-sm text-muted leading-relaxed">
          <p className="font-medium text-ink">{t('Orden #')}{boleta.id.slice(0, 8)}</p>
          <p>{formatearFecha(boleta.created_at)}</p>
          {boleta.fecha_entrega && <p>{t('Entregado:')} {formatearFecha(boleta.fecha_entrega)}</p>}
          <span
            className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              boleta.estado === 'entregado'
                ? 'bg-good/15 text-good'
                : boleta.estado === 'pagado'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-warn/15 text-warn'
            }`}
          >
            {t(boleta.estado)}
          </span>
        </div>

        <Divisor />

        <div className="flex flex-col gap-1">
          <EtiquetaSeccion>{t('Negocio')}</EtiquetaSeccion>
          <p className="font-medium">{boleta.negocio.nombre}</p>
          {boleta.negocio.telefono && <p className="text-muted">{boleta.negocio.telefono}</p>}
          {boleta.negocio.direccion && <p className="text-muted">{boleta.negocio.direccion}</p>}
        </div>

        {boleta.cliente_nombre && (
          <div className="flex flex-col gap-1">
            <EtiquetaSeccion>{t('Cliente')}</EtiquetaSeccion>
            <p className="font-medium">{boleta.cliente_nombre}</p>
          </div>
        )}

        {boleta.canjes.length > 0 && (
          <div className="flex flex-col gap-2">
            {boleta.canjes.map((c, idx) => (
              <div key={idx} className="rounded-xl bg-accent-soft p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">
                  {t('Plan canje — dispositivo entregado')}{boleta.canjes.length > 1 ? ` (${idx + 1} ${t('de')} ${boleta.canjes.length})` : ''}
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
                {c.monto != null && (
                  <p className="font-medium mt-1">
                    {t('Monto reconocido:')} {fmt(c.monto)}
                  </p>
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
              <th className="py-1.5 px-3 text-right rounded-r-lg border-l border-white/20">{t('Precio')}</th>
            </tr>
          </thead>
          <tbody>
            {boleta.items.map((i, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-canvas' : ''}>
                <td className="py-2.5 px-3">
                  {i.descripcion}
                  {i.estado_dispositivo === 'sellado' && (
                    <span className="ml-1.5 inline-block text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5 align-middle">
                      ✦ {t('SELLADO')}
                    </span>
                  )}
                  {i.garantia_vencimiento && (
                    <p className="text-xs text-muted mt-0.5">
                      🛡️ {t('Garantía hasta el')} {new Date(i.garantia_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}
                    </p>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center border-l border-border">{i.cantidad}</td>
                <td className="py-2.5 px-3 text-right font-medium border-l border-border">
                  {fmt(i.cantidad * i.precio_unitario)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="self-end w-full max-w-[280px] flex flex-col gap-2 text-sm">
          {boleta.anticipo != null && boleta.anticipo > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('Anticipo')}</span>
              <span>{fmt(boleta.anticipo)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span>{t('Subtotal')}</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {boleta.monto_canje != null && boleta.monto_canje > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('Plan canje')}</span>
              <span>-{fmt(boleta.monto_canje)}</span>
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
          {modo === 'ambas' && boleta.monto_secundario != null && boleta.moneda_secundaria && (
            <p className="text-xs text-muted italic text-right">
              ≈ {simboloMoneda(boleta.moneda_secundaria)}
              {boleta.monto_secundario.toLocaleString('es-AR')} {boleta.moneda_secundaria} ({t('valor informativo')})
            </p>
          )}
        </div>

        {boleta.forma_pago && (
          <p className="text-sm">
            <span className="text-muted">{t('Método de pago')} </span>
            <span className="font-medium">{boleta.forma_pago}</span>
          </p>
        )}

        {boleta.nota && (
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Nota')}</p>
            <p className="whitespace-pre-wrap text-muted">{boleta.nota}</p>
          </div>
        )}

        {boleta.incluir_aclaraciones_tecnico && boleta.aclaraciones_tecnico && (
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Aclaraciones del técnico')}</p>
            <p className="whitespace-pre-wrap text-muted">{boleta.aclaraciones_tecnico}</p>
          </div>
        )}

        {boleta.incluir_garantia &&
          ((tieneProductos && boleta.negocio.texto_garantia) ||
            (tieneTrabajos && boleta.negocio.texto_garantia_servicio)) && <Divisor />}

        {boleta.incluir_garantia && tieneProductos && boleta.negocio.texto_garantia && (
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Garantía de productos')}</p>
            <p className="whitespace-pre-wrap text-ink font-medium" style={{ fontSize: boleta.negocio.texto_garantia_tamano }}>
              {boleta.negocio.texto_garantia}
            </p>
          </div>
        )}

        {boleta.incluir_garantia && tieneTrabajos && boleta.negocio.texto_garantia_servicio && (
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{t('Garantía de servicio técnico')}</p>
            <p
              className="whitespace-pre-wrap text-ink font-medium"
              style={{ fontSize: boleta.negocio.texto_garantia_servicio_tamano }}
            >
              {boleta.negocio.texto_garantia_servicio}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
