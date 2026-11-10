'use client';

import { useMemo, useState } from 'react';
import { useT } from '../lib/idioma';
import type { ItemProductoR } from './datos';
import {
  armarCSVRanking,
  categoriaTieneSubcategorias,
  encabezadosRanking,
  filasParaExportar,
  filtrarItemsRanking,
  ordenarRanking,
  rankingCategoriasCompleto,
  rankingProductosCompleto,
  rankingSubcategoriasCompleto,
  totalDeFilas,
  type ColumnaRanking,
  type FilaRankingCompleta,
} from './rankingCompleto';

type Props = {
  items: ItemProductoR[]; // ya filtrados por período y sucursal (los mismos que usan los rankings de barras)
  moneda: string;
  puedeVerCostos: boolean;
  ocultarMontos: boolean;
  nombreNegocio: string;
  etiquetaPeriodo: string;
  etiquetaSucursal: string;
  categoriaInicial: string | null;
  onClose: () => void;
};

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'ranking';
}

export default function RankingDetalle({ items, moneda, puedeVerCostos, ocultarMontos, nombreNegocio, etiquetaPeriodo, etiquetaSucursal, categoriaInicial, onClose }: Props) {
  const t = useT();
  const [categoria, setCategoria] = useState<string | null>(categoriaInicial);
  const [subcategoria, setSubcategoria] = useState<string | null>(null);
  // Con una categoría que tiene subcategorías se baja de a un nivel: primero las subcategorías, después los productos.
  const [verProductos, setVerProductos] = useState(false);
  const [orden, setOrden] = useState<{ col: ColumnaRanking; desc: boolean }>({ col: 'facturacion', desc: true });
  const [exportando, setExportando] = useState(false);

  const categorias = useMemo(() => rankingCategoriasCompleto(items).map((f) => f.nombre).sort((a, b) => a.localeCompare(b, 'es')), [items]);
  const subcategoriasDeLaCategoria = useMemo(
    () => (categoria ? rankingSubcategoriasCompleto(items, categoria).map((f) => f.nombre).sort((a, b) => a.localeCompare(b, 'es')) : []),
    [items, categoria]
  );
  const tieneSubs = categoria != null && categoriaTieneSubcategorias(items, categoria);
  const nivelSubcategorias = categoria != null && tieneSubs && subcategoria == null && !verProductos;

  const filas: FilaRankingCompleta[] = useMemo(() => {
    if (nivelSubcategorias && categoria) return rankingSubcategoriasCompleto(items, categoria);
    return rankingProductosCompleto(filtrarItemsRanking(items, { categoria, subcategoria }));
  }, [items, categoria, subcategoria, nivelSubcategorias]);

  const ordenadas = useMemo(() => ordenarRanking(filas, orden.col, orden.desc), [filas, orden]);
  const total = useMemo(() => totalDeFilas(filas), [filas]);

  const dinero = (n: number | null) => {
    if (n == null) return '—';
    if (ocultarMontos) return '•••';
    return `${n < 0 ? '-' : ''}${moneda}${Math.abs(Math.round(n)).toLocaleString('es-AR')}`;
  };

  const elegirCategoria = (c: string | null) => {
    setCategoria(c);
    setSubcategoria(null);
    setVerProductos(false);
  };

  const ordenarPor = (col: ColumnaRanking) => setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'nombre' }));

  const etiquetaPrimera = nivelSubcategorias ? t('Subcategoría') : t('Producto');
  const titulo = [categoria, subcategoria].filter(Boolean).join(' › ') || t('Todas las categorías');
  const nombreArchivo = `ranking-${slug(titulo)}-${slug(etiquetaPeriodo)}`;

  const descargarCSV = () => {
    const csv = armarCSVRanking(ordenadas, puedeVerCostos, etiquetaPrimera);
    const cabecera = [
      [t('Negocio'), nombreNegocio || 'Qovento'],
      [t('Ranking'), titulo],
      [t('Período'), etiquetaPeriodo],
      [t('Sucursal'), etiquetaSucursal],
      [t('Moneda'), moneda],
    ]
      .map(([k, v]) => `"${k.replace(/"/g, '""')}","${v.replace(/"/g, '""')}"`)
      .join('\n');
    // ﻿: para que Excel abra bien los acentos.
    const blob = new Blob(['﻿' + cabecera + '\n\n' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombreArchivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarPDF = async () => {
    setExportando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      let y = 16;
      doc.setFontSize(14);
      doc.text(nombreNegocio || 'Qovento', 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(`${t('Ranking de productos')} — ${titulo}`, 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.text(`${t('Período')}: ${etiquetaPeriodo}   ·   ${t('Sucursal')}: ${etiquetaSucursal}   ·   ${t('Moneda')}: ${moneda}`, 14, y);
      y += 5;
      doc.text(`${t('Generado')}: ${new Date().toLocaleString('es-AR')}`, 14, y);
      y += 9;

      const encabezados = encabezadosRanking(puedeVerCostos, etiquetaPrimera);
      // Columnas numéricas alineadas a la derecha.
      const xs = puedeVerCostos ? [104, 130, 154, 178, 198] : [130, 170];
      const dibujarEncabezado = () => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(encabezados[0], 14, y);
        encabezados.slice(1).forEach((h, i) => doc.text(h, xs[i], y, { align: 'right' }));
        doc.setFont('helvetica', 'normal');
        y += 2;
        doc.line(14, y, 198, y);
        y += 5;
      };
      dibujarEncabezado();
      doc.setFontSize(8);
      for (const fila of filasParaExportar(ordenadas, puedeVerCostos)) {
        if (y > 280) {
          doc.addPage();
          y = 16;
          dibujarEncabezado();
          doc.setFontSize(8);
        }
        const nombre = (doc.splitTextToSize(fila[0], 82) as string[])[0] ?? '';
        doc.text(nombre, 14, y);
        fila.slice(1).forEach((v, i) => {
          const esDinero = i >= 1 && i <= 3;
          const texto =
            v === ''
              ? '—'
              : esDinero
                ? `${Number(v) < 0 ? '-' : ''}${moneda}${Math.abs(Number(v)).toLocaleString('es-AR')}`
                : i === 4
                  ? `${v}%`
                  : Number(v).toLocaleString('es-AR');
          doc.text(texto, xs[i], y, { align: 'right' });
        });
        y += 5.5;
      }
      doc.save(`${nombreArchivo}.pdf`);
    } finally {
      setExportando(false);
    }
  };

  const Cabecera = ({ col, children, alinear }: { col: ColumnaRanking; children: React.ReactNode; alinear?: 'right' }) => (
    <th className={`px-3 py-2 font-medium whitespace-nowrap ${alinear === 'right' ? 'text-right' : 'text-left'}`}>
      <button onClick={() => ordenarPor(col)} className="inline-flex items-center gap-1 hover:text-accent dark:hover:text-dark-accent">
        {children}
        <span className="text-[10px] w-2">{orden.col === col ? (orden.desc ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Ranking completo de productos')}
        className="bg-white dark:bg-dark-surface w-full max-w-4xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border dark:border-dark-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{t('Ranking de productos')}</h2>
            <nav className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
              <button onClick={() => elegirCategoria(null)} className="hover:underline">
                {t('Todas las categorías')}
              </button>
              {categoria && (
                <>
                  <span>›</span>
                  <button
                    onClick={() => {
                      setSubcategoria(null);
                      setVerProductos(false);
                    }}
                    className="hover:underline"
                  >
                    {categoria}
                  </button>
                </>
              )}
              {subcategoria && (
                <>
                  <span>›</span>
                  <span className="text-text dark:text-dark-text">{subcategoria}</span>
                </>
              )}
            </nav>
            <p className="mt-0.5 text-xs text-muted dark:text-dark-text-secondary">
              {etiquetaPeriodo} · {etiquetaSucursal}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('Cerrar')} className="shrink-0 rounded-lg border border-border dark:border-dark-border px-3 py-1 text-sm">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border dark:border-dark-border">
          <select
            value={categoria ?? ''}
            onChange={(e) => elegirCategoria(e.target.value || null)}
            aria-label={t('Categoría')}
            className="rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-1.5 text-sm"
          >
            <option value="">{t('Todas las categorías')}</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {tieneSubs && (
            <select
              value={subcategoria ?? ''}
              onChange={(e) => {
                setSubcategoria(e.target.value || null);
                setVerProductos(!!e.target.value);
              }}
              aria-label={t('Subcategoría')}
              className="rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-1.5 text-sm"
            >
              <option value="">{t('Todas las subcategorías')}</option>
              {subcategoriasDeLaCategoria.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {tieneSubs && subcategoria == null && (
            <button onClick={() => setVerProductos((v) => !v)} className="rounded-lg border border-border dark:border-dark-border px-3 py-1.5 text-sm font-medium">
              {nivelSubcategorias ? t('Ver todos los productos') : t('Ver por subcategoría')}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={descargarCSV} disabled={filas.length === 0} className="rounded-lg border border-border dark:border-dark-border px-3 py-1.5 text-sm font-medium disabled:opacity-40">
              {t('Descargar CSV')}
            </button>
            <button onClick={descargarPDF} disabled={filas.length === 0 || exportando} className="rounded-lg bg-accent dark:bg-dark-accent text-white px-3 py-1.5 text-sm font-medium disabled:opacity-40">
              {exportando ? t('Generando...') : t('Descargar PDF')}
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {filas.length === 0 ? (
            <p className="p-6 text-sm text-center text-muted dark:text-dark-text-secondary">{t('Sin ventas de productos en el período')}</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-white dark:bg-dark-surface border-b border-border dark:border-dark-border text-xs text-muted dark:text-dark-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-8">#</th>
                  <Cabecera col="nombre">{etiquetaPrimera}</Cabecera>
                  <Cabecera col="unidades" alinear="right">
                    {t('Unidades')}
                  </Cabecera>
                  <Cabecera col="facturacion" alinear="right">
                    {t('Facturación')}
                  </Cabecera>
                  {puedeVerCostos && (
                    <>
                      <Cabecera col="costo" alinear="right">
                        {t('Costo')}
                      </Cabecera>
                      <Cabecera col="ganancia" alinear="right">
                        {t('Ganancia')}
                      </Cabecera>
                      <Cabecera col="margen" alinear="right">
                        {t('Margen %')}
                      </Cabecera>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f, i) => (
                  <tr
                    key={f.clave}
                    className={`border-b border-border/60 dark:border-dark-border/60 ${nivelSubcategorias ? 'cursor-pointer hover:bg-canvas dark:hover:bg-dark-bg' : ''}`}
                    onClick={nivelSubcategorias ? () => setSubcategoria(f.nombre) : undefined}
                  >
                    <td className="px-3 py-2 text-xs text-muted dark:text-dark-text-secondary">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {nivelSubcategorias ? (
                        <button className="text-left hover:underline" onClick={() => setSubcategoria(f.nombre)}>
                          {f.nombre} ›
                        </button>
                      ) : (
                        f.nombre
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{f.unidades.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2 text-right">{dinero(f.facturacion)}</td>
                    {puedeVerCostos && (
                      <>
                        <td className="px-3 py-2 text-right">{dinero(f.costo)}</td>
                        <td className={`px-3 py-2 text-right ${f.ganancia != null && f.ganancia < 0 ? 'text-bad' : ''}`}>{dinero(f.ganancia)}</td>
                        <td className="px-3 py-2 text-right">{f.margen == null ? '—' : `${f.margen.toFixed(1)}%`}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-canvas dark:bg-dark-bg">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">{t('Total')}</td>
                  <td className="px-3 py-2 text-right">{total.unidades.toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2 text-right">{dinero(total.facturacion)}</td>
                  {puedeVerCostos && (
                    <>
                      <td className="px-3 py-2 text-right">{dinero(total.costo)}</td>
                      <td className="px-3 py-2 text-right">{dinero(total.ganancia)}</td>
                      <td className="px-3 py-2" />
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        {puedeVerCostos && (
          <p className="px-4 py-2 text-[11px] text-muted dark:text-dark-text-secondary border-t border-border dark:border-dark-border">
            {t('Costo, ganancia y margen cuentan solo las unidades que tienen costo cargado. "—" = ninguna unidad de esa fila tiene costo.')}
          </p>
        )}
      </div>
    </div>
  );
}
