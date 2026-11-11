'use client';

import { useState } from 'react';
import { useT } from '../lib/idioma';
import { FUENTES, type FuenteGanancia, type FilaFuente, type GananciaPorFuente, type MesFuente } from './gananciaPorFuente';
import { localeActual } from '../lib/formatoLocal';

type Props = {
  datos: GananciaPorFuente;
  serie: MesFuente[];
  moneda: string;
  puedeVerCostos: boolean;
  ocultarMontos: boolean;
  etiquetaPeriodo: string;
  etiquetaSucursal: string;
};

// Colores fijos por fuente (azul, naranja, aqua, violeta) con su variante para modo oscuro; el chip y la barra usan el mismo.
const COLOR: Record<FuenteGanancia, string> = {
  productos: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  creditos: 'bg-[#eb6834] dark:bg-[#d95926]',
  fiado: 'bg-[#1baf7a] dark:bg-[#199e70]',
  servicio: 'bg-[#8b5cf6] dark:bg-[#9a7af0]',
};

export default function PanelGananciaPorFuente({ datos, serie, moneda, puedeVerCostos, ocultarMontos, etiquetaPeriodo, etiquetaSucursal }: Props) {
  const t = useT();
  const [mesActivo, setMesActivo] = useState<number | null>(null);

  const NOMBRE: Record<FuenteGanancia, string> = {
    productos: t('Venta de productos'),
    creditos: t('Créditos propios (cuotas)'),
    fiado: t('Fiado / cuenta corriente'),
    servicio: t('Servicio técnico'),
  };
  const AYUDA: Record<FuenteGanancia, string> = {
    productos: t('Lo vendido al contado o con tarjeta (productos y equipos). La plata entra al vender.'),
    creditos: t('La parte de las ventas que quedó en un plan de cuotas propio. Cobrado = cuotas que entraron en el período (de cualquier venta).'),
    fiado: t('La parte de las ventas que quedó en la cuenta corriente del cliente. Cobrado = cobranzas de cuenta corriente del período que no fueron cuotas.'),
    servicio: t('Mano de obra y repuestos de reparaciones cobradas en el período.'),
  };

  const dinero = (n: number | null, conSigno = false) => {
    if (n == null) return '—';
    if (ocultarMontos) return '•••';
    const r = Math.round(n);
    return `${r < 0 ? '-' : conSigno && r > 0 ? '+' : ''}${moneda}${Math.abs(r).toLocaleString(localeActual())}`;
  };

  const filas: [FuenteGanancia | 'total', FilaFuente][] = [...FUENTES.map((f) => [f, datos[f]] as [FuenteGanancia, FilaFuente]), ['total', datos.total]];
  const maxMes = Math.max(1, ...serie.map((m) => Math.max(0, FUENTES.reduce((a, f) => a + Math.max(0, m.ganancia[f]), 0))));
  const hayGananciaMensual = serie.some((m) => m.total !== 0);
  const mes = mesActivo != null ? serie[mesActivo] : null;
  // Etiqueta corta del mes en el idioma elegido ("dic", "Jan 26"...): el año solo en enero.
  const etiquetaMes = (clave: string) => {
    const [anio, mm] = clave.split('-').map(Number);
    const nombre = new Date(anio, mm - 1, 1).toLocaleDateString(localeActual(), { month: 'short' }).replace('.', '');
    return mm === 1 ? `${nombre} ${String(anio).slice(2)}` : nombre;
  };

  return (
    <section className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-4 flex flex-col gap-4">
      <header>
        <h3 className="text-sm font-semibold">{t('Ganancia por fuente')}</h3>
        <p className="text-xs text-muted dark:text-dark-text-secondary mt-0.5">
          {etiquetaPeriodo} · {etiquetaSucursal}
        </p>
      </header>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm tabular-nums min-w-[560px]">
          <thead className="text-xs text-muted dark:text-dark-text-secondary border-b border-border dark:border-dark-border">
            <tr>
              <th className="px-2 py-2 text-left font-medium">{t('Fuente')}</th>
              <th className="px-2 py-2 text-right font-medium">{t('Facturado')}</th>
              {puedeVerCostos && <th className="px-2 py-2 text-right font-medium">{t('Costo')}</th>}
              {puedeVerCostos && <th className="px-2 py-2 text-right font-medium">{t('Ganancia')}</th>}
              <th className="px-2 py-2 text-right font-medium">{t('Cobrado')}</th>
              {puedeVerCostos && <th className="px-2 py-2 text-right font-medium">{t('Ganancia cobrada')}</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(([clave, f]) => {
              const esTotal = clave === 'total';
              return (
                <tr key={clave} className={`border-b border-border/60 dark:border-dark-border/60 ${esTotal ? 'font-semibold bg-canvas dark:bg-dark-bg' : ''}`}>
                  <td className="px-2 py-2">
                    {esTotal ? (
                      t('Total')
                    ) : (
                      <span className="inline-flex items-center gap-2" title={AYUDA[clave]}>
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLOR[clave]}`} />
                        {NOMBRE[clave]}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">{dinero(f.facturado)}</td>
                  {puedeVerCostos && <td className="px-2 py-2 text-right">{dinero(f.costo)}</td>}
                  {puedeVerCostos && <td className={`px-2 py-2 text-right ${f.ganancia < 0 ? 'text-bad' : ''}`}>{dinero(f.ganancia)}</td>}
                  <td className="px-2 py-2 text-right">{dinero(f.cobrado)}</td>
                  {puedeVerCostos && <td className="px-2 py-2 text-right">{dinero(f.gananciaCobrada)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1 text-[11px] text-muted dark:text-dark-text-secondary sm:grid-cols-2">
        {FUENTES.map((f) => (
          <li key={f}>
            <strong className="font-medium">{NOMBRE[f]}:</strong> {AYUDA[f]}
          </li>
        ))}
      </ul>
      {puedeVerCostos && (
        <p className="text-[11px] text-muted dark:text-dark-text-secondary">
          {t('En créditos, "Ganancia" es la que generan las ventas del período y "Ganancia cobrada" la parte que ya entró con las cuotas cobradas. En fiado no se puede atribuir lo cobrado a cada venta.')}
        </p>
      )}

      {puedeVerCostos && (
        <div>
          <h4 className="text-xs font-semibold mb-2">{t('Ganancia generada por mes (últimos 12 meses)')}</h4>
          {!hayGananciaMensual ? (
            <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no hay ganancia en los últimos 12 meses.')}</p>
          ) : ocultarMontos ? (
            <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Gráfico oculto (montos ocultos).')}</p>
          ) : (
            <>
              <div className="flex items-end gap-1 h-36" role="img" aria-label={t('Ganancia por fuente, últimos 12 meses')}>
                {serie.map((m, i) => (
                  <button
                    key={m.clave}
                    type="button"
                    onClick={() => setMesActivo(mesActivo === i ? null : i)}
                    onMouseEnter={() => setMesActivo(i)}
                    onMouseLeave={() => setMesActivo(null)}
                    onFocus={() => setMesActivo(i)}
                    onBlur={() => setMesActivo(null)}
                    className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent"
                  >
                    <div className="w-full max-w-[22px] flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${(Math.max(0, FUENTES.reduce((a, f) => a + Math.max(0, m.ganancia[f]), 0)) / maxMes) * 88}%` }}>
                      {FUENTES.map((f) => {
                        const v = Math.max(0, m.ganancia[f]);
                        const suma = FUENTES.reduce((a, g) => a + Math.max(0, m.ganancia[g]), 0);
                        return v > 0 ? <div key={f} className={COLOR[f]} style={{ height: `${(v / suma) * 100}%` }} /> : null;
                      })}
                    </div>
                    <span className="text-[9px] text-muted dark:text-dark-text-secondary truncate max-w-full">{etiquetaMes(m.clave)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 min-h-[2.5rem] text-xs">
                {mes ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <strong>
                      {etiquetaMes(mes.clave)}: {dinero(mes.total)}
                    </strong>
                    {FUENTES.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${COLOR[f]}`} />
                        {NOMBRE[f]} {dinero(mes.ganancia[f])}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted dark:text-dark-text-secondary">
                    {FUENTES.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${COLOR[f]}`} />
                        {NOMBRE[f]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
