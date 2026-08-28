'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import { useActor } from '../../../lib/actor';
import { tienePermiso } from '../../../lib/permisos';
import { obtenerPagosDeCaja, type Caja, type TurnoCaja } from '../../../lib/caja/servicio';
import { totalesPorMedio, totalGeneral, efectivoEsperado, MEDIOS_CAJA, NOMBRE_CAJA } from '../../../lib/caja/motor';
import { formatearMonto } from '../../../lib/numeros';
import { medioLabel } from '../../../lib/cuentaCorriente';
import { useT, useIdioma } from '../../../lib/idioma';
import { localeDe } from '../../../lib/i18n/traducir';

type Negocio = { nombre: string; logo_url: string | null };

export default function DetalleTurnoCaja() {
  const { id } = useParams<{ id: string }>();
  const supabase = crearClienteNavegador();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);
  const actor = useActor();
  // Mismo permiso que /caja (operar la caja) — sin esto, cualquiera con
  // sesión en el negocio podía ver el desglose de plata de un cierre con
  // solo conocer la URL del turno (queda en el historial del navegador tras
  // imprimir), sin pasar por ningún control de acceso.
  const puede = tienePermiso(actor, 'vender');

  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [cajaError, setCajaError] = useState(false);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [sucursalNombre, setSucursalNombre] = useState<string | null>(null);
  const [totales, setTotales] = useState(totalesPorMedio([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!puede) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: tu } = await supabase.from('caja_turnos').select('*').eq('id', id).maybeSingle();
      if (!tu) {
        setLoading(false);
        return;
      }
      setTurno(tu as TurnoCaja);
      // maybeSingle (no single): si la caja padre no se puede leer, no hay
      // que tirar un error genérico que después se confunde con "el cierre
      // no existe" — el turno SÍ se encontró, lo que falta es la caja.
      const { data: c } = await supabase.from('cajas').select('id, sucursal_id, tipo, nombre, activa').eq('id', tu.caja_id).maybeSingle();
      if (!c) {
        setCajaError(true);
        setLoading(false);
        return;
      }
      setCaja(c as Caja);
      if (c.sucursal_id) {
        const { data: s } = await supabase.from('sucursales').select('nombre').eq('id', c.sucursal_id).maybeSingle();
        setSucursalNombre(s?.nombre ?? null);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('negocios ( nombre, logo_url )').eq('id', user.id).single();
        setNegocio((perfil as any)?.negocios ?? null);
      }
      // Turno abierto: sin "hasta" (evita depender del reloj del navegador,
      // ver comentario en obtenerPagosDeCaja). Turno cerrado: hasta su
      // cerrada_en real, y filtrado por su propia moneda para no mezclar
      // efectivo de distintas monedas en un mismo total.
      const pagos = await obtenerPagosDeCaja(supabase, c as Caja, tu.abierta_en, tu.cerrada_en ?? undefined, tu.moneda);
      setTotales(totalesPorMedio(pagos));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puede]);

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver esto.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  if (loading) return <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>;
  if (!turno || !caja) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">
          {cajaError ? t('Encontramos el turno, pero no pudimos leer su caja.') : t('No encontramos ese cierre.')}
        </p>
        <Link href="/caja" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  // Turno cerrado: usar el efectivo_esperado que quedó guardado AL MOMENTO
  // del cierre (no recalcularlo) — si algún pago se anuló o se cargó
  // después, recalcular hoy daría un número distinto al que de verdad se
  // reconcilió ese día, y el historial dejaría de ser un registro fiel.
  const esperado = turno.estado === 'cerrada' && turno.efectivo_esperado != null ? turno.efectivo_esperado : efectivoEsperado(turno.efectivo_inicial, totales.efectivo);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-md mx-auto w-full print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/caja" className="text-2xl leading-none">
          &larr;
        </Link>
        <button onClick={() => window.print()} className="text-sm text-accent dark:text-dark-accent underline">
          🖨️ {t('Imprimir')}
        </button>
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-5 flex flex-col gap-3 print:border-0 print:shadow-none">
        <div className="flex items-center gap-2">
          {negocio?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={negocio.logo_url} alt="" className="h-10 w-10 object-contain rounded-lg" />
          )}
          <div>
            <p className="text-sm font-semibold">{negocio?.nombre}</p>
            {sucursalNombre && <p className="text-xs text-muted dark:text-dark-text-secondary">🏬 {sucursalNombre}</p>}
          </div>
        </div>

        <div className="border-t border-border dark:border-dark-border pt-3">
          <p className="text-base font-medium">
            {t(NOMBRE_CAJA[caja.tipo])} — {caja.nombre}
          </p>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {turno.estado === 'abierta' ? t('ACTUAL') : `${t('Cierre N°')} ${String(turno.numero).padStart(6, '0')}`}
          </p>
          <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">
            {t('Abierta:')} {new Date(turno.abierta_en).toLocaleString(locale)}
            {turno.abierta_por && ` (${turno.abierta_por})`}
          </p>
          {turno.cerrada_en && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('Cerrada:')} {new Date(turno.cerrada_en).toLocaleString(locale)}
              {turno.cerrada_por && ` (${turno.cerrada_por})`}
            </p>
          )}
        </div>

        <div className="border-t border-border dark:border-dark-border pt-3 flex flex-col gap-1.5">
          {MEDIOS_CAJA.map((m) => (
            <div key={m} className="flex justify-between text-sm">
              <span className="text-muted dark:text-dark-text-secondary">{medioLabel(m, t)}</span>
              <span className="font-medium tabular-nums">${formatearMonto(totales[m])}</span>
            </div>
          ))}
          {totales.otro > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted dark:text-dark-text-secondary">{t('Otro')}</span>
              <span className="font-medium tabular-nums">${formatearMonto(totales.otro)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold border-t border-border dark:border-dark-border pt-1.5 mt-1">
            <span>{t('Total')}</span>
            <span className="tabular-nums">${formatearMonto(totalGeneral(totales))}</span>
          </div>
        </div>

        <div className="border-t border-border dark:border-dark-border pt-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted dark:text-dark-text-secondary">{t('Efectivo inicial')}</span>
            <span className="tabular-nums">${formatearMonto(turno.efectivo_inicial)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted dark:text-dark-text-secondary">{t('Efectivo esperado')}</span>
            <span className="tabular-nums">${formatearMonto(esperado)}</span>
          </div>
          {turno.efectivo_declarado != null && (
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-text-secondary">{t('Efectivo declarado')}</span>
              <span className="tabular-nums">${formatearMonto(turno.efectivo_declarado)}</span>
            </div>
          )}
          {turno.diferencia != null && (
            <div className="flex justify-between font-medium">
              <span>{t('Diferencia')}</span>
              <span className={`tabular-nums ${turno.diferencia > 0.009 ? 'text-good' : turno.diferencia < -0.009 ? 'text-bad' : ''}`}>
                ${formatearMonto(turno.diferencia)}
              </span>
            </div>
          )}
          {turno.observacion && <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">{t('Obs:')} {turno.observacion}</p>}
        </div>
      </div>
    </main>
  );
}
