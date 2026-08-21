'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { PLANES_CUOTAS } from '../../lib/cuotas';
import { useT } from '../../lib/idioma';

export default function Financiacion() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  // Configurar financiación es cosa del dueño/administrador.
  const puede = tienePermiso(actor, 'gestionar_usuarios');

  const [negocioId, setNegocioId] = useState<string | null>(null);
  // Interés (%) por plan, como texto para poder dejar vacío (= plan apagado).
  const [interes, setInteres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocio_id, negocios ( interes_cuotas )')
        .eq('id', user.id)
        .single();
      const negId = (perfil as any)?.negocio_id ?? null;
      setNegocioId(negId);
      const guardado = (perfil as any)?.negocios?.interes_cuotas as Record<string, number> | null;
      if (guardado) {
        const m: Record<string, string> = {};
        for (const c of PLANES_CUOTAS) if (guardado[String(c)] != null) m[String(c)] = String(guardado[String(c)]);
        setInteres(m);
      }
      setLoading(false);
    })();
  }, []);

  const guardar = async () => {
    if (!negocioId) return;
    setGuardando(true);
    setError(null);
    setOk(false);
    // Solo se guardan los planes con un número válido; los vacíos quedan
    // apagados (no se ofrecen al vender).
    const obj: Record<string, number> = {};
    for (const c of PLANES_CUOTAS) {
      const v = interes[String(c)];
      if (v !== undefined && v !== '' && !isNaN(Number(v))) obj[String(c)] = Number(v);
    }
    const { error: upErr } = await supabase
      .from('negocios')
      .update({ interes_cuotas: Object.keys(obj).length ? obj : null })
      .eq('id', negocioId);
    setGuardando(false);
    if (upErr) {
      setError(t('No pudimos guardar:') + ' ' + upErr.message);
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para configurar la financiación.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Financiación en cuotas')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('Poné el')} <strong>{t('interés (%)')}</strong> {t('de cada plan. Dejá un plan vacío para no ofrecerlo. Al vender, elegís el plan y el recargo se calcula sobre el precio de contado.')}
      </p>
      <p className="text-xs text-muted dark:text-dark-text-secondary bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2">
        {t('Ojo:')} <strong>{t('Contado')}</strong> {t('(pago en el momento) NO tiene recargo y es aparte — no se configura acá.')}{' '}
        <strong>{t('1 cuota')}</strong> {t('NO es contado: es cuando el cliente paga todo junto pero')} <strong>{t('a ~1 mes')}</strong>, {t('así que sí lleva su recargo. 3 cuotas = 3 meses, 6 = 6 meses, 12 = 12 meses.')}
      </p>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {PLANES_CUOTAS.map((c) => (
            <div key={c} className="flex items-center gap-3 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3">
              <span className="w-24 leading-tight">
                <span className="block text-sm font-medium">{c} {c === 1 ? t('cuota') : t('cuotas')}</span>
                <span className="block text-[10px] text-muted dark:text-dark-text-secondary">{t('a ~')}{c} {c === 1 ? t('mes') : t('meses')}</span>
              </span>
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={interes[String(c)] ?? ''}
                  onChange={(e) =>
                    setInteres((p) => ({ ...p, [String(c)]: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') }))
                  }
                  inputMode="decimal"
                  placeholder={t('Sin ofrecer')}
                  className="w-28 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <span className="text-sm text-muted dark:text-dark-text-secondary">{t('% de interés')}</span>
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-4 py-3 text-xs text-muted dark:text-dark-text-secondary">
            {t('Ejemplo: un equipo de')} <strong>100.000</strong> {t('con 3 cuotas al')} <strong>10%</strong> →{' '}
            <strong>110.000</strong> {t('en total, o sea 3 de')} <strong>36.667</strong> {t('cada una.')}
          </div>

          <button
            disabled={guardando}
            onClick={guardar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            {guardando ? t('Guardando...') : ok ? `✓ ${t('Guardado')}` : t('Guardar')}
          </button>
        </div>
      )}
    </main>
  );
}
