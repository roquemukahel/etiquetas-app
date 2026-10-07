'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerTodasLasFilas } from '../lib/db';
import { soportaRubrosCompra } from '../lib/rubrosCompra';
import { useT } from '../lib/idioma';
import { StatCard, SeccionCard, EmptyState, formatMoneda } from './ui';
import { RankingBarras, type Dato } from './graficos';
import type { BloqueArea, ItemProductoR } from './datos';
import {
  SIN_RUBRO,
  comprasPorRubro,
  inventarioPorRubro,
  recuperoPorRubro,
  totalInventario,
  type CompraRubroR,
  type StockRubroR,
} from './rubros';

// Pestaña "Inversión por rubro": cuánto se compró, cuánto vale el inventario a
// costo, cuánto se recuperó con las ventas, rotación y alertas de agotamiento.
// Los rubros son las categorías del Stock. Solo con permiso para ver costos.
type Props = {
  supabase: SupabaseClient;
  rango: { inicio: Date; fin: Date };
  sucursalId: string | null;
  sucursales: { id: string; nombre: string }[];
  categorias: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  itemsVendidos: ItemProductoR[];
  taller: BloqueArea | null;
  moneda: string;
  ocultarMontos: boolean;
};

type Snapshot = { mes: string; unidades: number; costo_total: number; unidades_sin_costo: number };

const ceil1 = (n: number) => Math.round(n * 10) / 10;

export default function RubrosInversion({ supabase, rango, sucursalId, sucursales, categorias, proveedores, itemsVendidos, taller, moneda, ocultarMontos }: Props) {
  const t = useT();
  const [cargando, setCargando] = useState(true);
  const [compras, setCompras] = useState<CompraRubroR[]>([]);
  const [stock, setStock] = useState<StockRubroR[]>([]);
  const [fotos, setFotos] = useState<Snapshot[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [conRubros, setConRubros] = useState(true);

  const m = (n: number) => (ocultarMontos ? '••••' : formatMoneda(n, moneda));
  const nombreDe = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.nombre]));
    return (id: string | null) => (id ? mapa.get(id) ?? t('Categoría eliminada') : t(SIN_RUBRO));
  }, [categorias, t]);

  // Compras del período (cambian con el rango).
  const inicioMs = rango.inicio.getTime();
  const finMs = rango.fin.getTime();
  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      const soporta = await soportaRubrosCompra(supabase);
      const desde = new Date(inicioMs).toISOString();
      const hasta = new Date(finMs).toISOString();
      const [manuales, dispositivos] = await Promise.all([
        obtenerTodasLasFilas<{ categoria_id?: string | null; precio_unitario: number | null; cantidad: number; proveedor_id: string; sucursal_id: string | null; created_at: string }>(
          supabase,
          'compras_proveedor',
          'precio_unitario, cantidad, proveedor_id, sucursal_id, created_at' + (soporta ? ', categoria_id' : ''),
          [],
          (q) => q.gte('created_at', desde).lte('created_at', hasta)
        ),
        obtenerTodasLasFilas<{ categoria_id: string | null; costo: number | null; proveedor_id: string | null; sucursal_id: string | null; created_at: string }>(
          supabase,
          'dispositivos',
          'categoria_id, costo, proveedor_id, sucursal_id, created_at',
          [],
          (q) => q.not('proveedor_id', 'is', null).gte('created_at', desde).lte('created_at', hasta)
        ),
      ]);
      if (!vigente) return;
      setConRubros(soporta);
      setCompras([
        ...manuales.map((c) => ({
          categoria_id: c.categoria_id ?? null,
          monto: (c.precio_unitario || 0) * (c.cantidad || 0),
          proveedor_id: c.proveedor_id,
          sucursal_id: c.sucursal_id,
          fecha: c.created_at,
        })),
        ...dispositivos.map((d) => ({ categoria_id: d.categoria_id, monto: d.costo || 0, proveedor_id: d.proveedor_id, sucursal_id: d.sucursal_id, fecha: d.created_at })),
      ]);
      setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [supabase, inicioMs, finMs]);

  // Foto de HOY del inventario y fotos mensuales guardadas (no dependen del período).
  useEffect(() => {
    let vigente = true;
    (async () => {
      const [dispositivos, productos, snapshots] = await Promise.all([
        obtenerTodasLasFilas<{ categoria_id: string | null; costo: number | null; sucursal_id: string | null }>(supabase, 'dispositivos', 'categoria_id, costo, sucursal_id', [], (q) =>
          q.eq('en_stock', true)
        ),
        obtenerTodasLasFilas<{ categoria_id: string | null; costo: number | null; cantidad: number; sucursal_id: string | null }>(supabase, 'productos', 'categoria_id, costo, cantidad, sucursal_id', [], (q) =>
          q.gt('cantidad', 0)
        ),
        // Tabla opcional (compra_contado_rubros_supabase.sql): si no existe, queda vacío.
        Promise.resolve(supabase.from('inventario_snapshots').select('mes, unidades, costo_total, unidades_sin_costo').order('mes', { ascending: false }).limit(2000)).then(
          (r) => ((r.data as Snapshot[] | null) ?? []),
          () => [] as Snapshot[]
        ),
      ]);
      if (!vigente) return;
      setStock([
        ...dispositivos.map((d) => ({ categoria_id: d.categoria_id, sucursal_id: d.sucursal_id, unidades: 1, costo_unitario: d.costo })),
        ...productos.map((p) => ({ categoria_id: p.categoria_id, sucursal_id: p.sucursal_id, unidades: p.cantidad, costo_unitario: p.costo })),
      ]);
      setFotos(snapshots);
    })();
    return () => {
      vigente = false;
    };
  }, [supabase]);

  const dias = Math.max(1, Math.round((finMs - inicioMs) / 86400000));
  const filasCompras = useMemo(
    () => comprasPorRubro(compras, nombreDe, rango.inicio, rango.fin, { proveedorId: proveedorId || undefined, sucursalId }),
    [compras, nombreDe, rango, proveedorId, sucursalId]
  );
  const totalCompras = filasCompras.reduce((a, f) => a + f.monto, 0);
  const inventario = useMemo(() => inventarioPorRubro(stock, nombreDe, sucursalId), [stock, nombreDe, sucursalId]);
  const totalInv = useMemo(() => totalInventario(inventario), [inventario]);
  // El recupero compara TODO lo comprado del período (sin el filtro de proveedor).
  const comprasRecupero = useMemo(() => comprasPorRubro(compras, nombreDe, rango.inicio, rango.fin, { sucursalId }), [compras, nombreDe, rango, sucursalId]);
  const recupero = useMemo(
    () =>
      recuperoPorRubro({
        compras: comprasRecupero,
        ventas: itemsVendidos.map((v) => ({ categoriaNombre: v.categoriaNombre, cantidad: v.cantidad, precio_unitario: v.precio_unitario, costo: v.costo })),
        taller,
        inventario,
        dias,
      }),
    [comprasRecupero, itemsVendidos, taller, inventario, dias]
  );
  const alertas = recupero.filter((f) => f.alerta);
  const sucursalesVisibles = sucursalId ? sucursales.filter((s) => s.id === sucursalId) : sucursales;
  const mostrarPorSucursal = sucursalesVisibles.length > 1;

  // Una foto por mes: total del negocio (todas las sucursales/rubros).
  const fotosPorMes = useMemo(() => {
    const mapa = new Map<string, { unidades: number; costo: number; sinCosto: number }>();
    for (const f of fotos) {
      const e = mapa.get(f.mes) ?? { unidades: 0, costo: 0, sinCosto: 0 };
      e.unidades += f.unidades;
      e.costo += Number(f.costo_total) || 0;
      e.sinCosto += f.unidades_sin_costo;
      mapa.set(f.mes, e);
    }
    return Array.from(mapa.entries())
      .map(([mes, e]) => ({ mes, ...e }))
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 12);
  }, [fotos]);

  const datosCompras: Dato[] = filasCompras.map((f) => ({ nombre: f.rubro, valor: f.monto }));
  const datosGanancia: Dato[] = recupero.filter((f) => f.ventasConCosto > 0).map((f) => ({ nombre: f.rubro, valor: f.margen })).sort((a, b) => b.valor - a.valor);
  const claseTabla = 'w-full text-sm';
  const th = 'text-left text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary font-medium px-2 py-1.5';
  const td = 'px-2 py-1.5 border-t border-border dark:border-dark-border tabular-nums';

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard etiqueta={t('Comprado en el período')} valor={m(totalCompras)} tooltip={t('Compras a proveedores del período (equipos cargados al stock con proveedor + compras cargadas a mano), por rubro.')} moneda={moneda} sensible oculto={ocultarMontos} />
        <StatCard etiqueta={t('Inventario a costo')} valor={m(totalInv.costoTotal)} tooltip={t('Lo que costó todo el stock que hay hoy (equipos y accesorios), valuado al costo cargado.')} moneda={moneda} sensible oculto={ocultarMontos} />
        <StatCard etiqueta={t('Unidades en stock')} valor={totalInv.unidades.toLocaleString('es-AR')} tooltip={t('Equipos disponibles más unidades de accesorios, hoy.')} />
        <StatCard
          etiqueta={t('Stock sin costo cargado')}
          valor={`${ceil1(totalInv.pctSinCosto)}%`}
          tooltip={t('Porcentaje de las unidades en stock que no tienen costo cargado: el inventario a costo de arriba NO las incluye, así que vale más de lo que muestra.')}
          tono={totalInv.pctSinCosto > 0 ? 'text-warn' : undefined}
        />
      </div>

      {alertas.length > 0 && (
        <SeccionCard titulo={t('Alertas de agotamiento')} subtitulo={t('Rubros que se venden y se están quedando sin stock, al ritmo de venta del período.')}>
          <div className="flex flex-col gap-1.5">
            {alertas.map((f) => (
              <div key={f.rubro} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{f.rubro}</span>
                <span className={f.alerta === 'agotado' ? 'text-bad font-medium' : 'text-warn font-medium'}>
                  {f.alerta === 'agotado'
                    ? t('Agotado: se vendió y no queda stock')
                    : `${t('Por agotarse: alcanza para')} ${ceil1(f.coberturaDias ?? 0)} ${t('días')}`}
                </span>
              </div>
            ))}
          </div>
        </SeccionCard>
      )}

      <SeccionCard
        titulo={t('Compras por rubro')}
        subtitulo={t('Cuánto se invirtió en cada rubro en el período. Se puede filtrar por proveedor y, arriba, por sucursal.')}
        accion={
          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            aria-label={t('Proveedor')}
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1 text-xs max-w-[10rem]"
          >
            <option value="">{t('Todos los proveedores')}</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        }
      >
        {cargando ? (
          <EmptyState icono="⏳" titulo={t('Cargando...')} />
        ) : datosCompras.length === 0 ? (
          <EmptyState titulo={t('Sin compras en el período')} texto={t('Cuando cargues compras a proveedores (con su rubro), vas a ver acá cuánto invertiste en cada uno.')} />
        ) : (
          <RankingBarras datos={datosCompras} moneda={moneda} oculto={ocultarMontos} />
        )}
        {!conRubros && (
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2">
            {t('Las compras todavía no se clasifican por rubro: se verán como "Sin rubro" hasta activar la función en la base de datos.')}
          </p>
        )}
      </SeccionCard>

      <SeccionCard titulo={t('Inventario valuado a costo')} subtitulo={t('Stock actual por rubro (y por sucursal), valuado al costo cargado.')}>
        {inventario.length === 0 ? (
          <EmptyState titulo={t('Sin stock')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Rubro')}</th>
                  <th className={th}>{t('Unidades')}</th>
                  <th className={th}>{t('Costo total')}</th>
                  <th className={th}>{t('% sin costo')}</th>
                  {mostrarPorSucursal && sucursalesVisibles.map((s) => <th key={s.id} className={th}>🏬 {s.nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {inventario.map((f) => (
                  <tr key={f.rubro}>
                    <td className={`${td} font-medium`}>{f.rubro}</td>
                    <td className={td}>{f.unidades.toLocaleString('es-AR')}</td>
                    <td className={td}>{m(f.costoTotal)}</td>
                    <td className={`${td} ${f.pctSinCosto > 0 ? 'text-warn' : ''}`}>{ceil1(f.pctSinCosto)}%</td>
                    {mostrarPorSucursal &&
                      sucursalesVisibles.map((s) => (
                        <td key={s.id} className={td}>
                          {m(f.porSucursal[s.id]?.costoTotal ?? 0)}
                        </td>
                      ))}
                  </tr>
                ))}
                <tr>
                  <td className={`${td} font-semibold`}>{t('Total')}</td>
                  <td className={`${td} font-semibold`}>{totalInv.unidades.toLocaleString('es-AR')}</td>
                  <td className={`${td} font-semibold`}>{m(totalInv.costoTotal)}</td>
                  <td className={`${td} font-semibold`}>{ceil1(totalInv.pctSinCosto)}%</td>
                  {mostrarPorSucursal && sucursalesVisibles.map((s) => <td key={s.id} className={td} />)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>

      <SeccionCard
        titulo={t('Recupero por rubro')}
        subtitulo={t('Lo comprado en el período contra lo vendido: cuánto de la inversión ya volvió, el margen y lo que queda en stock.')}
      >
        {recupero.length === 0 ? (
          <EmptyState titulo={t('Sin movimientos en el período')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Rubro')}</th>
                  <th className={th}>{t('Comprado')}</th>
                  <th className={th}>{t('Costo de lo vendido')}</th>
                  <th className={th}>{t('Ventas')}</th>
                  <th className={th}>{t('Margen')}</th>
                  <th className={th}>{t('Stock que queda')}</th>
                  <th className={th}>{t('% recuperado')}</th>
                </tr>
              </thead>
              <tbody>
                {recupero.map((f) => (
                  <tr key={f.rubro}>
                    <td className={`${td} font-medium`}>{f.rubro}</td>
                    <td className={td}>{f.comprado > 0 ? m(f.comprado) : '—'}</td>
                    <td className={td}>{f.ventasConCosto > 0 ? m(f.costoVendido) : '—'}</td>
                    <td className={td}>{m(f.ventas)}</td>
                    <td className={`${td} ${f.margen < 0 ? 'text-bad' : f.margen > 0 ? 'text-good' : ''}`}>{f.ventasConCosto > 0 ? m(f.margen) : '—'}</td>
                    <td className={td}>{f.unidadesStock > 0 ? `${m(f.stockCosto)} (${f.unidadesStock.toLocaleString('es-AR')} u.)` : '—'}</td>
                    <td className={td}>{f.pctRecuperado != null ? `${Math.round(f.pctRecuperado)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2">
          {t('% recuperado = ventas del período ÷ comprado en el período. El margen solo cuenta lo que tiene costo cargado.')}
        </p>
      </SeccionCard>

      <SeccionCard titulo={t('Ganancia bruta por rubro')} subtitulo={t('Ventas menos costo en cada rubro, incluido Servicio técnico (mano de obra y repuestos).')}>
        {datosGanancia.length === 0 ? (
          <EmptyState titulo={t('Sin ganancia para mostrar')} texto={t('Hace falta tener costo cargado en lo que se vende.')} />
        ) : (
          <RankingBarras datos={datosGanancia} moneda={moneda} oculto={ocultarMontos} />
        )}
      </SeccionCard>

      <SeccionCard titulo={t('Rotación por rubro')} subtitulo={t('Cuántos días de stock hay, al ritmo de venta del período.')}>
        {recupero.filter((f) => f.rubro !== 'Servicio técnico' && f.unidadesStock > 0).length === 0 ? (
          <EmptyState titulo={t('Sin stock para medir')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Rubro')}</th>
                  <th className={th}>{t('Días de stock')}</th>
                  <th className={th}>{t('Unidades vendidas')}</th>
                  <th className={th}>{t('Unidades en stock')}</th>
                </tr>
              </thead>
              <tbody>
                {recupero
                  .filter((f) => f.rubro !== 'Servicio técnico' && f.unidadesStock > 0)
                  .map((f) => (
                    <tr key={f.rubro}>
                      <td className={`${td} font-medium`}>{f.rubro}</td>
                      <td className={td}>{f.diasDeStock != null ? Math.round(f.diasDeStock) : t('Sin ventas')}</td>
                      <td className={td}>{f.unidadesVendidas.toLocaleString('es-AR')}</td>
                      <td className={td}>{f.unidadesStock.toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>

      <SeccionCard titulo={t('Foto mensual del inventario')} subtitulo={t('El inventario a costo se fotografía solo el día 1 de cada mes (cierre del mes anterior).')}>
        {fotosPorMes.length === 0 ? (
          <EmptyState titulo={t('Todavía no hay fotos')} texto={t('La primera se guarda sola el próximo día 1 de mes.')} />
        ) : (
          <div className="overflow-x-auto">
            <table className={claseTabla}>
              <thead>
                <tr>
                  <th className={th}>{t('Cierre de')}</th>
                  <th className={th}>{t('Unidades')}</th>
                  <th className={th}>{t('Inventario a costo')}</th>
                  <th className={th}>{t('% sin costo')}</th>
                </tr>
              </thead>
              <tbody>
                {fotosPorMes.map((f) => (
                  <tr key={f.mes}>
                    <td className={`${td} font-medium`}>{new Date(f.mes + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</td>
                    <td className={td}>{f.unidades.toLocaleString('es-AR')}</td>
                    <td className={td}>{m(f.costo)}</td>
                    <td className={td}>{f.unidades > 0 ? `${ceil1((f.sinCosto / f.unidades) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>
    </>
  );
}
