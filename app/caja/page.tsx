'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor, getActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { registrarAuditoria } from '../lib/auditoria';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import {
  asegurarCajasPredeterminadas,
  obtenerCajas,
  obtenerTurnoAbierto,
  obtenerHistorialTurnos,
  obtenerPagosDeCaja,
  obtenerTurnoPorNumero,
  abrirTurno,
  cerrarTurno,
  reabrirTurno,
  type Caja,
  type TurnoCaja,
} from '../lib/caja/servicio';
import { totalesPorMedio, totalGeneral, efectivoEsperado, diferenciaArqueo, MEDIOS_CAJA, NOMBRE_CAJA, type TipoCaja } from '../lib/caja/motor';
import { sanitizarDecimal, formatearMonto } from '../lib/numeros';
import { medioLabel } from '../lib/cuentaCorriente';
import { useT, useIdioma } from '../lib/idioma';
import { localeDe } from '../lib/i18n/traducir';

export default function CajaPage() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDe(idioma);
  const puede = tienePermiso(actor, 'vender');
  const sucursalActualGlobal = useSucursalActual();

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<string | null>(sucursalActualGlobal.id ?? null);
  useEffect(() => setSucursalId(sucursalActualGlobal.id ?? null), [sucursalActualGlobal.id]);
  // La moneda del turno es la del negocio al momento de abrirlo — antes
  // quedaba hardcodeada en 'ARS' sin importar la configuración real.
  const [monedaNegocio, setMonedaNegocio] = useState('ARS');

  const [tipo, setTipo] = useState<TipoCaja>('venta_diaria');
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [totales, setTotales] = useState(totalesPorMedio([]));
  const [historial, setHistorial] = useState<TurnoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const [efectivoInicial, setEfectivoInicial] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  const [cerrando, setCerrando] = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');
  const [observacion, setObservacion] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      const m = (perfil as any)?.negocios?.moneda;
      if (m) setMonedaNegocio(m);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asegurar las 2 cajas predeterminadas solo depende de la sucursal, no de
  // qué pestaña (tipo) esté mirando — antes se repetía el RPC en cada click
  // de pestaña sin necesidad, contra un unique index que ya estaba satisfecho.
  useEffect(() => {
    asegurarCajasPredeterminadas(supabase, sucursalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  const cajaActual = useMemo(() => cajas.find((c) => c.tipo === tipo) ?? null, [cajas, tipo]);

  const cargar = async () => {
    if (!puede) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cajasData = await obtenerCajas(supabase, sucursalId);
      setCajas(cajasData);
      const caja = cajasData.find((c) => c.tipo === tipo);
      if (caja) {
        const [t1, hist] = await Promise.all([obtenerTurnoAbierto(supabase, caja.id), obtenerHistorialTurnos(supabase, caja.id)]);
        setTurno(t1);
        setHistorial(hist);
        if (t1) {
          // Sin "hasta": filtrar contra el reloj del navegador podía dejar
          // afuera una venta recién cobrada si ese reloj estaba atrasado
          // respecto al del servidor (que es quien pone la fecha real).
          const pagos = await obtenerPagosDeCaja(supabase, caja, t1.abierta_en, undefined, t1.moneda);
          setTotales(totalesPorMedio(pagos));
        } else {
          setTotales(totalesPorMedio([]));
        }
      }
    } catch (e) {
      // Un error real de lectura NUNCA debe verse igual que "esta caja está
      // cerrada" — si no, alguien podría creer que no hay turno abierto
      // cuando en realidad no se pudo consultar.
      setError(e instanceof Error ? e.message : t('No pudimos cargar la caja. Recargá la página.'));
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, tipo, puede]);

  const handleAbrir = async () => {
    if (!cajaActual) return;
    setAbriendo(true);
    setError(null);
    const a = getActor();
    const { turno: nuevo, error: err } = await abrirTurno(supabase, cajaActual.id, Number(efectivoInicial) || 0, monedaNegocio, a?.nombre ?? null);
    setAbriendo(false);
    if (err || !nuevo) {
      setError(err || t('No pudimos abrir la caja.'));
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `abrió el turno N° ${nuevo.numero} de ${cajaActual.nombre}${a ? ` con ${formatearMonto(Number(efectivoInicial) || 0)} de inicial` : ''}`,
      entidad: 'caja_turno',
      entidadId: nuevo.id,
    });
    setEfectivoInicial('');
    await cargar();
  };

  const handleCerrar = async () => {
    if (!turno) return;
    setCerrando(true);
    setError(null);
    const a = getActor();
    const { turno: cerrado, error: err } = await cerrarTurno(supabase, turno.id, Number(efectivoDeclarado) || 0, observacion.trim() || null, a?.nombre ?? null);
    setCerrando(false);
    if (err || !cerrado) {
      setError(err || t('No pudimos cerrar la caja.'));
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cerró el turno N° ${cerrado.numero} de ${cajaActual?.nombre ?? ''} (declarado ${formatearMonto(Number(efectivoDeclarado) || 0)}, diferencia ${formatearMonto(cerrado.diferencia ?? 0)})`,
      entidad: 'caja_turno',
      entidadId: cerrado.id,
    });
    setModalCierre(false);
    setEfectivoDeclarado('');
    setObservacion('');
    await cargar();
  };

  const handleReabrir = async (tu: TurnoCaja) => {
    if (!confirm(`${t('¿Reabrir el turno N°')} ${tu.numero}? ${t('Solo se puede si no se cerró ya uno después.')}`)) return;
    setError(null);
    // caja_reabrir_turno() borra el turno siguiente (auto-creado al cerrar
    // este) si sigue intacto — eso es un borrado real de un registro
    // contable, y cualquier borrado en esta app tiene que quedar
    // auditado. Se busca ANTES de reabrir porque después ya no va a existir.
    const sucesor = await obtenerTurnoPorNumero(supabase, tu.caja_id, tu.numero + 1).catch(() => null);
    const { turno: reabierto, error: err } = await reabrirTurno(supabase, tu.id);
    if (err || !reabierto) {
      setError(err || t('No pudimos reabrir el turno.'));
      return;
    }
    await registrarAuditoria(supabase, { accion: `reabrió el turno N° ${tu.numero} de ${cajaActual?.nombre ?? ''}`, entidad: 'caja_turno', entidadId: tu.id });
    if (sucesor && sucesor.estado === 'abierta') {
      await registrarAuditoria(supabase, {
        accion: `eliminó el turno N° ${sucesor.numero} de ${cajaActual?.nombre ?? ''} (se auto-había creado al cerrar el N° ${tu.numero}, y quedó vacío al reabrirlo)`,
        entidad: 'caja_turno',
        entidadId: sucesor.id,
        valorAnterior: { numero: sucesor.numero, efectivo_inicial: sucesor.efectivo_inicial, abierta_en: sucesor.abierta_en },
      });
    }
    await cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para operar la caja.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  const esperado = turno ? efectivoEsperado(turno.efectivo_inicial, totales.efectivo) : 0;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Caja')}</span>
      </header>

      {sucursales.length > 1 && (
        <select
          value={sucursalId ?? ''}
          onChange={(e) => setSucursalId(e.target.value || null)}
          className="self-start bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              🏬 {s.nombre}
            </option>
          ))}
        </select>
      )}

      <div className="inline-flex items-center gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-1 self-start">
        {(['venta_diaria', 'financiamiento'] as TipoCaja[]).map((tp) => (
          <button
            key={tp}
            onClick={() => setTipo(tp)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tipo === tp ? 'bg-white dark:bg-dark-surface-elevated text-ink dark:text-dark-text shadow-card' : 'text-muted dark:text-dark-text-secondary'
            }`}
          >
            {t(NOMBRE_CAJA[tp])}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : !turno ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
          <p className="text-sm font-medium">{t('Caja cerrada — abrila para empezar el turno')}</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted dark:text-dark-text-secondary">{t('Efectivo inicial')}</span>
            <input
              value={efectivoInicial}
              onChange={(e) => setEfectivoInicial(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              placeholder="0"
              className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <button
            disabled={abriendo}
            onClick={handleAbrir}
            className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {abriendo ? t('Abriendo…') : `🔓 ${t('Abrir caja')}`}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {t('Turno N°')} {String(turno.numero).padStart(6, '0')}
              </p>
              <span className="text-[11px] rounded-full px-2 py-0.5 bg-good/15 text-good font-medium">{t('ACTUAL')}</span>
            </div>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('Abierta el')} {new Date(turno.abierta_en).toLocaleString(locale)}
              {turno.abierta_por && ` · ${turno.abierta_por}`}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border dark:border-dark-border">
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
            </div>
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-border dark:border-dark-border">
              <span>{t('Total')}</span>
              <span className="tabular-nums">${formatearMonto(totalGeneral(totales))}</span>
            </div>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('Efectivo inicial')} ${formatearMonto(turno.efectivo_inicial)} + {t('efectivo cobrado')} ${formatearMonto(totales.efectivo)} = {t('efectivo esperado')}{' '}
              <span className="font-medium text-ink dark:text-dark-text">${formatearMonto(esperado)}</span>
            </p>

            <button
              onClick={() => {
                setEfectivoDeclarado(String(Math.round(esperado * 100) / 100));
                setModalCierre(true);
              }}
              className="rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium mt-1"
            >
              🔒 {t('Cerrar caja')}
            </button>
          </div>

          {modalCierre && (
            <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-dark-surface rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
                <p className="text-sm font-medium">{t('Cerrar caja — arqueo')}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  {t('Efectivo esperado:')} <span className="font-medium text-ink dark:text-dark-text">${formatearMonto(esperado)}</span>
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted dark:text-dark-text-secondary">{t('Efectivo contado')}</span>
                  <input
                    value={efectivoDeclarado}
                    onChange={(e) => setEfectivoDeclarado(sanitizarDecimal(e.target.value))}
                    inputMode="decimal"
                    autoFocus
                    className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                {efectivoDeclarado !== '' && Math.abs(diferenciaArqueo(Number(efectivoDeclarado), esperado)) > 0.009 && (
                  <p className={`text-xs font-medium ${Number(efectivoDeclarado) > esperado ? 'text-good' : 'text-bad'}`}>
                    {Number(efectivoDeclarado) > esperado ? t('Sobra') : t('Falta')} ${formatearMonto(Math.abs(diferenciaArqueo(Number(efectivoDeclarado), esperado)))}
                  </p>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted dark:text-dark-text-secondary">{t('Observación (opcional)')}</span>
                  <textarea
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    rows={2}
                    className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </label>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setModalCierre(false)} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
                    {t('Cancelar')}
                  </button>
                  <button
                    disabled={cerrando || efectivoDeclarado === ''}
                    onClick={handleCerrar}
                    className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-40"
                  >
                    {cerrando ? t('Cerrando…') : t('Confirmar cierre')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2 mt-2">
        <button onClick={() => setVerHistorial((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline self-start">
          {verHistorial ? t('Ocultar historial de cierres') : t('Ver historial de cierres')} ({historial.length})
        </button>
        {verHistorial &&
          historial.map((h) => (
            <div key={h.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {t('Cierre N°')} {String(h.numero).padStart(6, '0')}
                </p>
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  {h.cerrada_en && new Date(h.cerrada_en).toLocaleString(locale)}
                  {h.cerrada_por && ` · ${h.cerrada_por}`}
                </p>
                {h.diferencia != null && Math.abs(h.diferencia) > 0.009 && (
                  <p className={`text-xs font-medium ${h.diferencia > 0 ? 'text-good' : 'text-bad'}`}>
                    {h.diferencia > 0 ? t('Sobró') : t('Faltó')} ${formatearMonto(Math.abs(h.diferencia))}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/caja/turno/${h.id}`} className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap">
                  {t('Ver / imprimir')}
                </Link>
                <button onClick={() => handleReabrir(h)} className="text-xs text-bad underline whitespace-nowrap">
                  {t('Reabrir')}
                </button>
              </div>
            </div>
          ))}
        {verHistorial && historial.length === 0 && (
          <p className="text-xs text-muted dark:text-dark-text-secondary text-center">{t('Todavía no hay cierres de esta caja.')}</p>
        )}
      </div>
    </main>
  );
}
