'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { crearClienteNavegador } from './lib/supabase/client';
import { USDT_RED, USDT_DIRECCION, PRECIO_USDT_MENSUAL, PRECIO_USDT_ANUAL } from './lib/pagoManual';
import { useT } from './lib/idioma';

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  estado: string;
  created_at: string;
  nota_admin: string | null;
};

export default function PagoUSDT({
  negocioId,
  nombreNegocio,
  comprobante,
  onEnviado,
  abiertoPorDefecto = false,
}: {
  negocioId: string;
  nombreNegocio?: string | null;
  comprobante: Comprobante | null;
  onEnviado: () => void;
  abiertoPorDefecto?: boolean;
}) {
  const t = useT();
  const supabase = crearClienteNavegador();
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [plan, setPlan] = useState<'mensual' | 'anual'>('mensual');
  const [imagen, setImagen] = useState<string | null>(null);
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || qr) return;
    // Escanear la dirección evita tener que copiarla a mano (y equivocarse
    // de un carácter) — sirve con cualquier billetera compatible con
    // BEP20, no hace falta que sea Binance.
    QRCode.toDataURL(USDT_DIRECCION, { margin: 0, width: 160 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [abierto, qr]);

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagen(reader.result as string);
    reader.readAsDataURL(file);
  };

  const enviar = async () => {
    if (!imagen) {
      setError(t('Subí una foto o captura de pantalla del comprobante.'));
      return;
    }
    setEnviando(true);
    setError(null);
    const monto = plan === 'mensual' ? PRECIO_USDT_MENSUAL : PRECIO_USDT_ANUAL;
    const { error: insertError } = await supabase.from('comprobantes_pago').insert({
      negocio_id: negocioId,
      monto,
      moneda: 'USDT',
      comprobante_imagen: imagen,
      referencia: referencia.trim() || null,
    });
    if (insertError) {
      setError(t('No pudimos enviar el comprobante:') + ' ' + insertError.message);
      setEnviando(false);
      return;
    }
    // Best-effort: si el aviso falla, no rompe el flujo del negocio que
    // recién pagó — su comprobante ya quedó guardado, eso es lo que importa.
    fetch('/api/notificar-comprobante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombreNegocio, monto, moneda: 'USDT', referencia: referencia.trim() || null, metodo: 'USDT (cripto)' }),
    }).catch(() => {});
    setEnviando(false);
    setAbierto(false);
    setImagen(null);
    setReferencia('');
    onEnviado();
  };

  if (comprobante?.estado === 'pendiente') {
    return (
      <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 flex flex-col gap-1">
        <p className="text-sm font-medium text-warn">{t('Tu comprobante está en revisión')}</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Enviado el')} {new Date(comprobante.created_at).toLocaleDateString('es-AR')} — {comprobante.moneda} {comprobante.monto}
        </p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Te vamos a activar la cuenta apenas lo revisemos. Puede demorar unas horas.')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
      {comprobante?.estado === 'rechazado' && (
        <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">
          {t('Tu último comprobante fue rechazado')}{comprobante.nota_admin ? `: ${comprobante.nota_admin}` : '.'} {t('Podés enviar uno nuevo.')}
        </p>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        className="text-sm font-medium text-accent dark:text-dark-accent underline self-start"
      >
        {abierto ? t('Ocultar') : t('¿Preferís pagar con USDT (cripto)?')}
      </button>

      {abierto && (
        <div className="flex flex-col gap-3">
          {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Plan')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPlan('mensual')}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  plan === 'mensual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Mensual')} · US${PRECIO_USDT_MENSUAL}
              </button>
              <button
                onClick={() => setPlan('anual')}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  plan === 'anual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Anual')} · US${PRECIO_USDT_ANUAL}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-canvas dark:bg-dark-bg p-3 flex gap-3 items-start">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('Código QR de la dirección')} className="w-24 h-24 rounded-lg shrink-0 bg-white p-1" />
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Red:')} {USDT_RED}</p>
              <p className="text-sm font-mono break-all">{USDT_DIRECCION}</p>
              <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">
                {t('Monto a transferir:')} {plan === 'mensual' ? PRECIO_USDT_MENSUAL : PRECIO_USDT_ANUAL} USDT
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
              {t('Comprobante (foto o captura de la transferencia)')}
            </label>
            <input type="file" accept="image/*" onChange={handleArchivo} className="text-sm" />
            {imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagen} alt={t('Comprobante')} className="mt-2 max-h-48 rounded-lg border border-border dark:border-dark-border" />
            )}
          </div>

          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder={t('Hash de la transacción (opcional)')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />

          <button
            disabled={enviando}
            onClick={enviar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-center text-sm font-medium text-white disabled:opacity-40"
          >
            {enviando ? t('Enviando...') : t('Enviar comprobante')}
          </button>
        </div>
      )}
    </div>
  );
}
