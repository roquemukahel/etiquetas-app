'use client';

import { useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import {
  TRANSFERENCIA_CVU,
  TRANSFERENCIA_ALIAS,
  TRANSFERENCIA_TITULAR,
  PRECIO_ARS_MENSUAL,
  PRECIO_ARS_ANUAL,
} from './lib/pagoManual';
import { useT } from './lib/idioma';

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  estado: string;
  created_at: string;
  nota_admin: string | null;
};

export default function PagoTransferenciaARS({
  negocioId,
  comprobante,
  onEnviado,
  abiertoPorDefecto = false,
}: {
  negocioId: string;
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
    const monto = plan === 'mensual' ? PRECIO_ARS_MENSUAL : PRECIO_ARS_ANUAL;
    const { error: insertError } = await supabase.from('comprobantes_pago').insert({
      negocio_id: negocioId,
      monto,
      moneda: 'ARS',
      comprobante_imagen: imagen,
      referencia: referencia.trim() || null,
    });
    if (insertError) {
      setError(t('No pudimos enviar el comprobante:') + ' ' + insertError.message);
      setEnviando(false);
      return;
    }
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
        {abierto ? t('Ocultar') : t('¿Preferís pagar por transferencia (Argentina)?')}
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
                {t('Mensual')} · ${PRECIO_ARS_MENSUAL.toLocaleString('es-AR')}
              </button>
              <button
                onClick={() => setPlan('anual')}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  plan === 'anual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Anual')} · ${PRECIO_ARS_ANUAL.toLocaleString('es-AR')}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-canvas dark:bg-dark-bg p-3 flex flex-col gap-1">
            <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Alias')}</p>
            <p className="text-sm font-mono break-all">{TRANSFERENCIA_ALIAS}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">CVU</p>
            <p className="text-sm font-mono break-all">{TRANSFERENCIA_CVU}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">{t('Titular')}</p>
            <p className="text-sm">{TRANSFERENCIA_TITULAR}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">
              {t('Monto a transferir:')} ${(plan === 'mensual' ? PRECIO_ARS_MENSUAL : PRECIO_ARS_ANUAL).toLocaleString('es-AR')}
            </p>
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
            placeholder={t('Número de operación (opcional)')}
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
