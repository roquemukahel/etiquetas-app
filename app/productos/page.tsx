'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { obtenerTodasLasFilas } from '../lib/db';
import { obtenerCategorias, type Categoria } from '../lib/categorias';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { obtenerProductosMaestro, type ProductoMaestro } from '../lib/productosMaestro';
import { useSucursalActual } from '../lib/sucursal';
import { useT } from '../lib/idioma';

type ProductoFila = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria_id: string | null;
  precio: number | null;
  cantidad: number;
  sucursal_id: string | null;
  producto_maestro_id: string | null;
};

type FilaGrid = {
  clave: string;
  maestro: ProductoMaestro | null;
  categoria: string;
  marca: string;
  nombre: string;
  stockTotal: number;
  stockSucursal: number;
  final: number | null;
};

export default function Productos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [maestros, setMaestros] = useState<ProductoMaestro[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  useEffect(() => {
    (async () => {
      const [filas, maestrosData, categoriasData] = await Promise.all([
        obtenerTodasLasFilas<ProductoFila>(
          supabase,
          'productos',
          'id, nombre, marca, categoria_id, precio, cantidad, sucursal_id, producto_maestro_id',
          [{ columna: 'nombre' }]
        ),
        obtenerProductosMaestro(supabase, false),
        obtenerCategorias(supabase, false).catch(() => [] as Categoria[]),
      ]);
      setProductos(filas);
      setMaestros(maestrosData);
      setCategorias(categoriasData);
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categorias) mapa.set(c.id, c.nombre);
    return mapa;
  }, [categorias]);

  const filas: FilaGrid[] = useMemo(() => {
    const mapaMaestros = new Map(maestros.map((m) => [m.id, m]));
    const normalizar = (s: string | null) => (s ?? '').trim().toLowerCase();
    type Grupo = { maestro: ProductoMaestro | null; nombre: string; marca: string | null; categoriaId: string | null; precio: number | null; stockTotal: number; stockSucursal: number };
    const porClave = new Map<string, Grupo>();

    for (const p of productos) {
      // Una fila todavía sin enlazar a un maestro (negocio que no corrió la
      // migración, o el catálogo por defecto que se carga solo al entrar a
      // Stock por primera vez) NO pierde su identidad: en vez de agruparla
      // por su propio id (lo que la mostraría separada de "la misma" fila en
      // otra sucursal), se agrupa por nombre+marca normalizados — el mismo
      // criterio que usaba el backfill — así el cruce entre sucursales sigue
      // funcionando aunque falte el enlace exacto.
      const clave = p.producto_maestro_id ?? `sin-maestro:${normalizar(p.nombre)}|${normalizar(p.marca)}`;
      const maestro = p.producto_maestro_id ? mapaMaestros.get(p.producto_maestro_id) ?? null : null;
      const actual =
        porClave.get(clave) ??
        ({
          maestro,
          nombre: maestro?.nombre ?? p.nombre,
          marca: maestro?.marca ?? p.marca,
          categoriaId: maestro?.categoria_id ?? p.categoria_id,
          precio: maestro?.precio ?? p.precio,
          stockTotal: 0,
          stockSucursal: 0,
        } as Grupo);
      actual.stockTotal += p.cantidad;
      if (sucursalActual.id && p.sucursal_id === sucursalActual.id) actual.stockSucursal += p.cantidad;
      porClave.set(clave, actual);
    }

    const resultado: FilaGrid[] = [];
    for (const [clave, info] of porClave) {
      resultado.push({
        clave,
        maestro: info.maestro,
        categoria: info.categoriaId ? nombreCategoria.get(info.categoriaId) ?? '' : '',
        marca: info.marca ?? '',
        nombre: info.nombre,
        stockTotal: info.stockTotal,
        stockSucursal: info.stockSucursal,
        final: info.precio,
      });
    }
    resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, maestros, nombreCategoria, sucursalActual.id]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroCategoria && f.maestro?.categoria_id !== filtroCategoria) return false;
      if (!q) return true;
      return f.nombre.toLowerCase().includes(q) || f.marca.toLowerCase().includes(q);
    });
  }, [filas, busqueda, filtroCategoria]);

  const nombreSucursalActual = sucursales.find((s) => s.id === sucursalActual.id)?.nombre ?? null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/" className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t('Productos')}</h1>
          <p className="text-sm text-muted dark:text-dark-muted">
            {t('Vista de consulta de todo el catálogo. Para editar cantidad, precio o costo de un producto, hacelo desde Stock.')}
          </p>
        </div>
        {puedeAgregarStock && sucursales.length > 1 && (
          <Link
            href="/productos/remitos/nuevo"
            className="shrink-0 rounded-lg bg-accent dark:bg-dark-accent text-white text-sm font-medium px-3 py-2 hover:opacity-90"
          >
            {t('Nuevo remito')}
          </Link>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t('Buscar producto o marca...')}
          className="flex-1 min-w-[200px] rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm"
        />
        {categorias.length > 0 && (
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2 text-sm"
          >
            <option value="">{t('Todas las categorías')}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
        {sucursales.length > 1 && (
          <Link href="/productos/remitos" className="text-sm text-accent dark:text-dark-accent hover:underline shrink-0">
            {t('Ver remitos emitidos')}
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-muted">{t('Cargando...')}</p>
      ) : filasFiltradas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">{t('No hay productos que coincidan.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface dark:bg-dark-surface text-left text-xs uppercase text-muted dark:text-dark-muted">
                <th className="px-3 py-2 font-medium">{t('Categoría')}</th>
                <th className="px-3 py-2 font-medium">{t('Marca')}</th>
                <th className="px-3 py-2 font-medium">{t('Producto')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('Stock Total')}</th>
                <th className="px-3 py-2 font-medium text-right">
                  {t('Stock Sucursal')}
                  {nombreSucursalActual ? ` (${nombreSucursalActual})` : ''}
                </th>
                <th className="px-3 py-2 font-medium text-right">{t('Final')}</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <tr key={f.clave} className="border-t border-border dark:border-dark-border">
                  <td className="px-3 py-2 text-muted dark:text-dark-muted">{f.categoria || '—'}</td>
                  <td className="px-3 py-2">{f.marca || '—'}</td>
                  <td className="px-3 py-2 font-medium">{f.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.stockTotal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{sucursalActual.id ? f.stockSucursal : f.stockTotal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.final != null ? `$${f.final.toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
