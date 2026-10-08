'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useT } from '../lib/idioma';
import { StatCard, SeccionCard, EmptyState, formatMoneda } from './ui';
import { bloqueVentas, type ItemR, type OrdenR } from './datos';
import { aFechaISO } from '../lib/financiacion/motor';
import { opcionesLocalidad, coincideLocalidad } from '../lib/localidades';
import FiltroLocalidad from '../FiltroLocalidad';
import {
  capitalEnLaCalle,
  gananciaPendienteTotal,
  grupoDeVenta,
  moraPorTramo,
  otorgadosEnPeriodo,
  porcentajeRecupero,
  proyeccionCobranzas,
  recuperoEnPeriodo,
  retornoPorMesDeOriginacion,
  tiempoPromedioRecupero,
  vigentes,
  type EstadoCredito,
  type GrupoVenta,
  type PlanCartera,
} from '../lib/financiacion/cartera';
import { cargarCartera, type CarteraCargada } from '../lib/financiacion/carteraDatos';

// Pestaña "Cartera de financiación": cada crédito como una inversión (costo de lo
// entregado → cuánto volvió → cuándo se empieza a ganar), la mora, el retorno por mes
// de originación, la proyección de cobranzas y las ventas separadas en pago exclusivo
// vs. financiado. El período y la sucursal son los de la pantalla de Estadísticas.
type Props = {
  supabase: SupabaseClient;
  rango: { inicio: Date; fin: Date };
  sucursalId: string | null;
  categorias: { id: string; nombre: string }[];
  // Ventas del período ya depuradas (sin cobranzas ni ajustes) y sus ítems, para separar
  // pago exclusivo vs financiado.
  ordenes: OrdenR[];
  itemsPorOrden: Map<string, ItemR[]>;
  moneda: string;
  ocultarMontos: boolean;
};

const ETIQUETA_ESTADO: Record<EstadoCredito, string> = {
  recuperando: 'Recuperando costo',
  ganancia: 'Costo recuperado / en ganancia',
  cancelado: 'Cancelado',
  sin_costo: 'Sin costo cargado',
};
const COLOR_ESTADO: Record<EstadoCredito, string> = {
  recuperando: 'bg-warn/10 text-warn',
  ganancia: 'bg-good/10 text-good',
  cancelado: 'bg-border text-muted',
  sin_costo: 'bg-border text-muted',
};

const redondear1 = (n: number) => Math.round(n * 10) / 10;

export default function CarteraFinanciacion({ supabase, rango, sucursalId, categorias, ordenes, itemsPorOrden, moneda, ocultarMontos }: Props) {
  const t = useT();
  const [datos, setDatos] = useState<CarteraCargada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroLocalidad, setFiltroLocalidad] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  const nombreCategoria = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.nombre]));
    return (id: string | null) => (id ? mapa.get(id) ?? 'Categoría eliminada' : 'Sin categoría');
  }, [categorias]);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const d = await cargarCartera(supabase, nombreCategoria);
        if (vigente) setDatos(d);
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [supabase, nombreCategoria]);

  const m = (n: number) => (ocultarMontos ? '••••' : formatMoneda(n, moneda));

  const planes: PlanCartera[] = useMemo(() => {
    if (!datos) return [];
    return datos.planes.filter(
      (p) =>
        (!sucursalId || p.sucursalId === sucursalId) &&
        (!filtroCategoria || p.categorias.includes(filtroCategoria)) &&
        coincideLocalidad(p.localidad, filtroLocalidad)
    );
  }, [datos, sucursalId, filtroCategoria, filtroLocalidad]);

  const localidades = useMemo(() => opcionesLocalidad((datos?.planes ?? []).map((p) => p.localidad)), [datos]);
  const categoriasEnUso = useMemo(() => Array.from(new Set((datos?.planes ?? []).flatMap((p) => p.categorias))).sort(), [datos]);

  const hoy = useMemo(() => new Date(), []);
  const hoyISO = aFechaISO(hoy);
  const calle = capitalEnLaCalle(planes);
  const recupero = recuperoEnPeriodo(planes, rango.inicio, rango.fin);
  const gananciaPend = gananciaPendienteTotal(planes);
  const pctRecupero = porcentajeRecupero(planes);
  const tiempo = tiempoPromedioRecupero(planes);
  const mora = moraPorTramo(planes, hoyISO);
  const otorgados = otorgadosEnPeriodo(planes, rango.inicio, rango.fin);
  const originacion = useMemo(() => retornoPorMesDeOriginacion(planes), [planes]);
  const proyeccion = proyeccionCobranzas(planes, hoyISO);
  const creditosVigentes = vigentes(planes).length;
  const sinCosto = planes.filter((p) => p.estado === 'sin_costo').length;

  // Ventas del período por forma de cobro: pago exclusivo / financiado / otros.
  const ventasPorGrupo = useMemo(() => {
    const grupos: Record<GrupoVenta, OrdenR[]> = { exclusivo: [], financiado: [], otros: [] };
    for (const o of ordenes) grupos[grupoDeVenta(o.forma_pago, datos?.ordenesConPlan.has(o.id) ?? false)].push(o);
    const calc = (lista: OrdenR[]) => {
      const b = bloqueVentas(lista, itemsPorOrden, [], [], rango.inicio, rango.fin);
      return { cantidad: b.operaciones, monto: b.ventas, ganancia: b.ganancia, cobertura: b.ventas > 0 ? b.ventasConCosto / b.ventas : 0 };
    };
    return { exclusivo: calc(grupos.exclusivo), financiado: calc(grupos.financiado), otros: calc(grupos.otros) };
  }, [ordenes, itemsPorOrden, datos, rango]);

  const filas = useMemo(
    () => [...planes].sort((a, b) => b.faltaCobrar - a.faltaCobrar || b.creadoEn.localeCompare(a.creadoEn)),
    [planes]
  );
  const filasVisibles = verTodos ? filas : filas.slice(0, 25);

  const claseTabla = 'w-full text-sm';
  const th = 'text-left text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary font-medium px-2 py-1.5';
  const td = 'px-2 py-1.5 border-t border-border dark:border-dark-border tabular-nums';

  if (error) return <EmptyState icono="⚠️" titulo={t('No pudimos cargar la cartera')} texto={error} />;
  if (!datos) return <EmptyState icono="⏳" titulo={t('Cargando...')} />;
  if (datos.planes.length === 0) {
    return <EmptyState titulo={t('Todavía no hay créditos de financiación propia')} texto={t('Cuando cargues una venta financiada en cuotas, vas a ver acá cuánta plata está en la calle y cuánto ya volvió.')} />;
  }

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filtroCategoria}
        onChange={(e) => setFiltroCategoria(e.target.value)}
        aria-label={t('Categoría')}
        className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-3 py-2 text-sm"
      >
        <option value="">{t('Todas las categorías')}</option>
        {categoriasEnUso.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <FiltroLocalidad opciones={localidades} value={filtroLocalidad} onChange={setFiltroLocalidad} />
      {datos.otrasMonedas > 0 && (
        <span className="text-[11px] text-muted dark:text-dark-text-secondary">
          {datos.otrasMonedas} {t('créditos en otra moneda no se incluyen.')}
        </span>
      )}
    </div>
  );

  return (
    <>
      {filtros}

      <SeccionCard
        titulo={t('Ventas: pago exclusivo vs. financiado')}
        subtitulo={t('Las ventas del período separadas por cómo se cobraron. Pago exclusivo = contado, transferencia o débito; financiado = crédito en cuotas propias.')}
      >
        <div className="overflow-x-auto">
          <table className={claseTabla}>
            <thead>
              <tr>
                <th className={th}>{t('Tipo de venta')}</th>
                <th className={th}>{t('Cantidad')}</th>
                <th className={th}>{t('Monto')}</th>
                <th className={th}>{t('Ganancia')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['exclusivo', 'Pago exclusivo (contado, transferencia, débito)'],
                  ['financiado', 'Financiado'],
                  ['otros', 'Otros (crédito de tarjeta, cuenta corriente sin cuotas)'],
                ] as [GrupoVenta, string][]
              ).map(([g, etiqueta]) => (
                <tr key={g}>
                  <td className={`${td} font-medium`}>{t(etiqueta)}</td>
                  <td className={td}>{ventasPorGrupo[g].cantidad.toLocaleString('es-AR')}</td>
                  <td className={td}>{m(ventasPorGrupo[g].monto)}</td>
                  <td className={td}>{ventasPorGrupo[g].cobertura > 0 ? m(ventasPorGrupo[g].ganancia) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2">
          {t('La ganancia solo cuenta lo que tiene costo cargado.')}
        </p>
      </SeccionCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          etiqueta={t('Capital en la calle')}
          valor={m(calle)}
          tooltip={t('Costo de la mercadería todavía NO recuperado de los créditos vigentes: la plata que invertiste y sigue afuera.')}
          moneda={moneda}
          tono={calle > 0 ? 'text-warn' : undefined}
          sensible
          oculto={ocultarMontos}
        />
        <StatCard
          etiqueta={t('Capital recuperado en el período')}
          valor={m(recupero.capital)}
          tooltip={t('Lo cobrado en el período que fue a recuperar el costo de la mercadería (incluye la cuota 1 cobrada el día de la venta).')}
          moneda={moneda}
          tono="text-good"
          sensible
          oculto={ocultarMontos}
        />
        <StatCard
          etiqueta={t('Ganancia cobrada en el período')}
          valor={m(recupero.ganancia)}
          tooltip={t('Lo cobrado en el período por encima del costo: solo después de recuperar el costo de un crédito empieza a contar como ganancia.')}
          moneda={moneda}
          tono="text-good"
          sensible
          oculto={ocultarMontos}
        />
        <StatCard
          etiqueta={t('Ganancia pendiente de cobro')}
          valor={m(gananciaPend)}
          tooltip={t('Ganancia que todavía falta cobrar de los créditos vigentes (lo que queda por cobrar por encima del costo).')}
          moneda={moneda}
          sensible
          oculto={ocultarMontos}
        />
        <StatCard
          etiqueta={t('Recupero de la cartera')}
          valor={pctRecupero != null ? `${redondear1(pctRecupero)}%` : '—'}
          tooltip={t('Qué porcentaje de lo invertido en los créditos vigentes ya volvió.')}
        />
        <StatCard
          etiqueta={t('Tiempo promedio en recuperar el costo')}
          valor={tiempo ? `${Math.round(tiempo.dias)} ${t('días')}` : '—'}
          tooltip={t('Cuántos días tarda, en promedio, un crédito en recuperar el costo de la mercadería (solo cuenta los que ya lo recuperaron).')}
        />
        <StatCard
          etiqueta={t('Mora (vencido sin cobrar)')}
          valor={m(mora.total)}
          tooltip={t('Cuotas vencidas y todavía impagas de los créditos vigentes.')}
          moneda={moneda}
          tono={mora.total > 0 ? 'text-bad' : undefined}
          sensible
          oculto={ocultarMontos}
        >
          {mora.cuotas > 0 && (
            <span className="text-[11px] text-bad font-medium">
              {mora.cuotas} {mora.cuotas === 1 ? t('cuota') : t('cuotas')} · {t('hasta')} {mora.maxDias} {t('días de atraso')}
            </span>
          )}
        </StatCard>
        <StatCard
          etiqueta={t('Créditos otorgados en el período')}
          valor={otorgados.cantidad.toLocaleString('es-AR')}
          tooltip={t('Cantidad de créditos nuevos del período, con lo financiado y lo invertido.')}
        >
          {otorgados.cantidad > 0 && (
            <span className="text-[11px] text-muted dark:text-dark-text-secondary">
              {ocultarMontos ? '' : `${m(otorgados.financiado)} ${t('financiado')} · ${m(otorgados.costo)} ${t('invertido')}`}
            </span>
          )}
        </StatCard>
      </div>

      <SeccionCard titulo={t('Mora por tramo de atraso')} subtitulo={t('Monto vencido y sin cobrar, según los días de atraso.')}>
        {mora.cuotas === 0 ? (
          <EmptyState icono="✅" titulo={t('Sin mora')} texto={t('No hay cuotas vencidas sin cobrar.')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Atraso')}</th>
                  <th className={th}>{t('Cuotas')}</th>
                  <th className={th}>{t('Monto vencido')}</th>
                </tr>
              </thead>
              <tbody>
                {mora.tramos.map((tr) => (
                  <tr key={tr.tramo}>
                    <td className={`${td} font-medium`}>{tr.tramo === '60+' ? t('Más de 60 días') : `${tr.tramo} ${t('días')}`}</td>
                    <td className={td}>{tr.cuotas}</td>
                    <td className={`${td} ${tr.monto > 0 ? 'text-bad' : ''}`}>{m(tr.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>

      <SeccionCard
        titulo={t('Proyección de cobranzas')}
        subtitulo={t('Cuánto debería entrar por cuotas en los próximos 30, 60 y 90 días, para planificar compras y saber cuánto se puede volver a financiar.')}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              ['Ya vencido (por cobrar)', proyeccion.vencido],
              ['Próximos 30 días', proyeccion.d30],
              ['De 31 a 60 días', proyeccion.d60],
              ['De 61 a 90 días', proyeccion.d90],
            ] as [string, number][]
          ).map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-border dark:border-dark-border px-3 py-2.5">
              <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t(etiqueta)}</p>
              <p className="text-lg font-display font-semibold tabular-nums">{m(valor)}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2">
          {t('Total a cobrar en 90 días')}: {m(proyeccion.d30 + proyeccion.d60 + proyeccion.d90)} · {creditosVigentes} {t('créditos vigentes')}
        </p>
      </SeccionCard>

      <SeccionCard
        titulo={t('Retorno por mes de originación')}
        subtitulo={t('De los créditos otorgados en cada mes: cuánto se invirtió, cuánto del costo ya volvió y cuánta ganancia ya se cobró.')}
      >
        {originacion.length === 0 ? (
          <EmptyState titulo={t('Sin créditos para mostrar')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Mes')}</th>
                  <th className={th}>{t('Créditos')}</th>
                  <th className={th}>{t('Invertido')}</th>
                  <th className={th}>{t('Recuperado')}</th>
                  <th className={th}>{t('% recuperado')}</th>
                  <th className={th}>{t('Ganancia cobrada')}</th>
                </tr>
              </thead>
              <tbody>
                {originacion.map((f) => (
                  <tr key={f.mes}>
                    <td className={`${td} font-medium`}>{new Date(f.mes + '-01T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</td>
                    <td className={td}>{f.creditos}</td>
                    <td className={td}>{m(f.invertido)}</td>
                    <td className={td}>{m(f.recuperado)}</td>
                    <td className={td}>{f.pctRecuperado != null ? `${Math.round(f.pctRecuperado)}%` : '—'}</td>
                    <td className={`${td} ${f.gananciaCobrada > 0 ? 'text-good' : ''}`}>{m(f.gananciaCobrada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>

      <SeccionCard
        titulo={t('Créditos')}
        subtitulo={t('Cada crédito como una inversión: costo entregado, total financiado, cobrado y lo que falta.')}
      >
        {sinCosto > 0 && (
          <p className="text-[11px] text-warn mb-2">
            {sinCosto} {t('créditos no tienen costo cargado en lo vendido: no se puede calcular su recupero ni su ganancia.')}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className={claseTabla}>
            <thead>
              <tr>
                <th className={th}>{t('Cliente')}</th>
                <th className={th}>{t('Costo (invertido)')}</th>
                <th className={th}>{t('Total financiado')}</th>
                <th className={th}>{t('Cobrado')}</th>
                <th className={th}>{t('Falta cobrar')}</th>
                <th className={th}>{t('Estado')}</th>
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <span className="font-medium">{datos.nombresClientes.get(p.clienteId) ?? t('Cliente')}</span>
                    <span className="block text-[11px] text-muted dark:text-dark-text-secondary">
                      {new Date(p.creadoEn).toLocaleDateString('es-AR')}
                      {p.localidad ? ` · 📍 ${p.localidad}` : ''}
                    </span>
                  </td>
                  <td className={td}>{p.costoConocido ? m(p.costo) : p.costo > 0 ? `${m(p.costo)}*` : '—'}</td>
                  <td className={td}>{m(p.totalFinanciado)}</td>
                  <td className={td}>{m(p.cobrado)}</td>
                  <td className={td}>{m(p.faltaCobrar)}</td>
                  <td className={td}>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_ESTADO[p.estado]}`}>{t(ETIQUETA_ESTADO[p.estado])}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length > 25 && (
          <button onClick={() => setVerTodos((v) => !v)} className="mt-2 text-xs text-accent dark:text-dark-accent underline">
            {verTodos ? t('Ver menos') : `${t('Ver los')} ${filas.length} ${t('créditos')}`}
          </button>
        )}
        <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2">
          * {t('Costo parcial: algún producto de la venta no tenía costo cargado.')}
        </p>
      </SeccionCard>
    </>
  );
}
