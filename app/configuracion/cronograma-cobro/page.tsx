'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import { falla } from '../../lib/escritura';
import { useT } from '../../lib/idioma';
import { soportaMigracion } from '../../lib/migraciones';
import { obtenerCronograma } from '../../lib/clienteCobroDatos';
import { FUENTES_CON_CRONOGRAMA, etiquetaFuente } from '../../lib/clienteCobro';

// El día del mes en que cobran los clientes que dependen de un cronograma por terminación de DNI (jubilaciones, pensiones y AUH).
// Se carga una vez (cambia poco) y la ficha del cliente lo usa solo cuando no tiene un día de cobro cargado a mano.
export default function CronogramaCobro() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_usuarios');

  const [disponible, setDisponible] = useState<boolean | undefined>(undefined);
  // fuente → terminación → texto del día ('' = sin cargar)
  const [dias, setDias] = useState<Record<string, string[]>>({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puede) return;
    (async () => {
      const ok = await soportaMigracion(supabase, 'cronogramaCobro');
      setDisponible(ok);
      if (!ok) return;
      const cron = await obtenerCronograma(supabase);
      const inicial: Record<string, string[]> = {};
      for (const f of FUENTES_CON_CRONOGRAMA) inicial[f] = Array.from({ length: 10 }, (_, d) => (cron?.[f]?.[d] != null ? String(cron[f][d]) : ''));
      setDias(inicial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const cambiar = (fuente: string, terminacion: number, valor: string) => {
    const n = parseInt(valor.replace(/\D/g, '').slice(0, 2), 10);
    const limpio = Number.isFinite(n) && n >= 1 && n <= 31 ? String(n) : '';
    setDias((prev) => ({ ...prev, [fuente]: (prev[fuente] ?? Array(10).fill('')).map((v, i) => (i === terminacion ? limpio : v)) }));
    setMensaje(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    for (const fuente of FUENTES_CON_CRONOGRAMA) {
      if (await falla(supabase.from('cronograma_cobro').delete().eq('fuente', fuente), t, 'guardar el cronograma')) return setGuardando(false);
      const filas = (dias[fuente] ?? []).map((v, terminacion) => (v ? { fuente, terminacion, dia: Number(v) } : null)).filter((f): f is { fuente: string; terminacion: number; dia: number } => f !== null);
      if (filas.length > 0 && (await falla(supabase.from('cronograma_cobro').insert(filas), t, 'guardar el cronograma'))) return setGuardando(false);
    }
    await registrarAuditoria(supabase, { accion: 'actualizó el cronograma de cobro por terminación de DNI', entidad: 'configuracion' });
    setGuardando(false);
    setMensaje(t('Cronograma guardado.'));
  };

  if (!puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar el cronograma de cobro.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Cronograma de cobro por DNI')}</span>
      </header>
      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('Jubilaciones, pensiones y AUH se cobran un día distinto según el último número del DNI. Cargá acá el día del mes de cada terminación: si un cliente de esas fuentes no tiene un día de cobro propio, se usa este para avisarte cuando ya cobró y no pagó.')}
      </p>
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {disponible === undefined ? (
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      ) : disponible === false ? (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">{t('Esta función todavía no está activada en la base de datos (clientes_cobro_supabase.sql).')}</p>
      ) : (
        <>
          {FUENTES_CON_CRONOGRAMA.map((fuente) => (
            <section key={fuente} className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{t(etiquetaFuente(fuente))}</h2>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, d) => (
                  <label key={d} className="flex flex-col gap-1 text-xs text-muted dark:text-dark-text-secondary">
                    {t('DNI termina en')} {d}
                    <input
                      value={dias[fuente]?.[d] ?? ''}
                      onChange={(e) => cambiar(fuente, d, e.target.value)}
                      inputMode="numeric"
                      placeholder={t('día')}
                      className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm text-text dark:text-dark-text text-center"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-2xl bg-accent dark:bg-dark-accent text-white py-3 text-sm font-medium disabled:opacity-40"
          >
            {guardando ? t('Guardando...') : t('Guardar cronograma')}
          </button>
          {mensaje && <p className="text-sm text-good text-center">{mensaje}</p>}
        </>
      )}
    </main>
  );
}
