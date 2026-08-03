'use client';

import { useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import { TRANSFERENCIA_CVU, TRANSFERENCIA_ALIAS, TRANSFERENCIA_TITULAR, PRECIO_ARS_MENSUAL } from './lib/pagoManual';

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
  const supabase = crearClienteNavegador();
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
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
      setError('Subí una foto o captura de pantalla del comprobante.');
      return;
    }
    setEnviando(true);
    setError(null);
    const { error: insertError } = await supabase.from('comprobantes_pago').insert({
      negocio_id: negocioId,
      monto: PRECIO_ARS_MENSUAL,
      moneda: 'ARS',
      comprobante_imagen: imagen,
      referencia: referencia.trim() || null,
    });
    if (insertError) {
      setError('No pudimos enviar el comprobante: ' + insertError.message);
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
        <p className="text-sm font-medium text-warn">Tu comprobante está en revisión</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Enviado el {new Date(comprobante.created_at).toLocaleDateString('es-AR')} — {comprobante.moneda} {comprobante.monto}
        </p>
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Te vamos a activar la cuenta apenas lo revisemos. Puede demorar unas horas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
      {comprobante?.estado === 'rechazado' && (
        <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">
          Tu último comprobante fue rechazado{comprobante.nota_admin ? `: ${comprobante.nota_admin}` : '.'} Podés enviar uno nuevo.
        </p>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        className="text-sm font-medium text-accent dark:text-dark-accent underline self-start"
      >
        {abierto ? 'Ocultar' : '¿Preferís pagar por transferencia (Argentina)?'}
      </button>

      {abierto && (
        <div className="flex flex-col gap-3">
          {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="rounded-xl bg-canvas dark:bg-dark-bg p-3 flex flex-col gap-1">
            <p className="text-xs text-muted dark:text-dark-text-secondary">Alias</p>
            <p className="text-sm font-mono break-all">{TRANSFERENCIA_ALIAS}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">CVU</p>
            <p className="text-sm font-mono break-all">{TRANSFERENCIA_CVU}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">Titular</p>
            <p className="text-sm">{TRANSFERENCIA_TITULAR}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary mt-2">
              Monto a transferir: ${PRECIO_ARS_MENSUAL.toLocaleString('es-AR')} (plan mensual)
            </p>
          </div>

          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
              Comprobante (foto o captura de la transferencia)
            </label>
            <input type="file" accept="image/*" onChange={handleArchivo} className="text-sm" />
            {imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagen} alt="Comprobante" className="mt-2 max-h-48 rounded-lg border border-border dark:border-dark-border" />
            )}
          </div>

          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Número de operación (opcional)"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />

          <button
            disabled={enviando}
            onClick={enviar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-center text-sm font-medium text-white disabled:opacity-40"
          >
            {enviando ? 'Enviando...' : 'Enviar comprobante'}
          </button>
        </div>
      )}
    </div>
  );
}
