'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { obtenerTodasLasFilas } from '../lib/db';
import { obtenerCategorias, type Categoria } from '../lib/categorias';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';
import { obtenerProductosMaestro, actualizarProductoMaestro, crearProductoMaestro, type ProductoMaestro } from '../lib/productosMaestro';
import { registrarAuditoria } from '../lib/auditoria';
import { descargarDatos, leerArchivoDatos, valorDe, insertarEnTandas } from '../lib/csv';
import { sanitizarDecimal } from '../lib/numeros';
import { useSucursalActual } from '../lib/sucursal';
import { useT } from '../lib/idioma';
import { marcaDeModelo } from '../lib/catalogosMarcas';
import Modal from '../Modal';

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

type DispositivoFila = {
  id: string;
  modelo: string | null;
  categoria_id: string | null;
  precio: number | null;
  sucursal_id: string | null;
  imei: string | null;
};

type FilaGrid = {
  clave: string;
  maestro: ProductoMaestro | null;
  categoriaId: string | null;
  categoria: string;
  marca: string;
  nombre: string;
  stockTotal: number;
  stockSucursal: number;
  final: number | null;
  // Solo para celulares (agrupados por modelo, sin maestro): los IMEI de
  // cada unidad del grupo, para poder encontrar un equipo puntual por su
  // número de serie sin tener que ir a Stock.
  imeis: string[];
};

export default function Productos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoFila[]>([]);
  const [maestros, setMaestros] = useState<ProductoMaestro[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [editando, setEditando] = useState<ProductoMaestro | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formMarca, setFormMarca] = useState('');
  const [formCategoriaId, setFormCategoriaId] = useState('');
  const [formCosto, setFormCosto] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCodigoBarras, setFormCodigoBarras] = useState('');
  const [formGarantiaDias, setFormGarantiaDias] = useState('');
  const [formStockMinimo, setFormStockMinimo] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [filas, dispositivosData, maestrosData, categoriasData] = await Promise.all([
        obtenerTodasLasFilas<ProductoFila>(
          supabase,
          'productos',
          'id, nombre, marca, categoria_id, precio, cantidad, sucursal_id, producto_maestro_id',
          [{ columna: 'nombre' }]
        ),
        // Celulares (tabla dispositivos): son "productos" también desde la
        // perspectiva de esta vista, aunque vivan en una tabla distinta a
        // los accesorios. Solo los que siguen en stock — vendidos no cuentan
        // como stock disponible en ninguna sucursal.
        obtenerTodasLasFilas<DispositivoFila>(supabase, 'dispositivos', 'id, modelo, categoria_id, precio, sucursal_id, imei', [], (q) =>
          q.eq('en_stock', true)
        ),
        obtenerProductosMaestro(supabase, false),
        obtenerCategorias(supabase, false).catch(() => [] as Categoria[]),
      ]);
      setProductos(filas);
      setDispositivos(dispositivosData);
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

  const abrirEdicion = (maestro: ProductoMaestro) => {
    setEditando(maestro);
    setFormNombre(maestro.nombre);
    setFormMarca(maestro.marca ?? '');
    setFormCategoriaId(maestro.categoria_id ?? '');
    setFormCosto(maestro.costo != null ? String(maestro.costo) : '');
    setFormPrecio(maestro.precio != null ? String(maestro.precio) : '');
    setFormSku(maestro.sku ?? '');
    setFormCodigoBarras(maestro.codigo_barras ?? '');
    setFormGarantiaDias(maestro.garantia_dias != null ? String(maestro.garantia_dias) : '');
    setFormStockMinimo(maestro.stock_minimo != null ? String(maestro.stock_minimo) : '');
    setErrorEdicion(null);
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    if (!formNombre.trim()) {
      setErrorEdicion(t('Poné un nombre.'));
      return;
    }
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    const resultado = await actualizarProductoMaestro(supabase, editando.id, {
      nombre: formNombre,
      marca: formMarca || null,
      categoriaId: formCategoriaId || null,
      costo: formCosto ? Number(formCosto) : null,
      precio: formPrecio ? Number(formPrecio) : null,
      sku: formSku || null,
      codigoBarras: formCodigoBarras || null,
      garantiaDias: formGarantiaDias ? Number(formGarantiaDias) : null,
      stockMinimo: formStockMinimo ? Number(formStockMinimo) : null,
    });
    if ('error' in resultado) {
      setErrorEdicion(resultado.error);
      setGuardandoEdicion(false);
      return;
    }
    const nuevoCosto = formCosto ? Number(formCosto) : null;
    const nuevoPrecio = formPrecio ? Number(formPrecio) : null;
    // El precio/costo que de verdad se cobra en Nueva Orden y se muestra en
    // Stock sale de la fila de `productos` de esa sucursal, NO del maestro
    // — el maestro es solo el valor de referencia que arma esta grilla.
    // Sin este paso, editar "Costo"/Final acá parecía funcionar (esta
    // grilla ya prioriza el precio del maestro) pero no cambiaba nada de lo
    // que en verdad se cobra, quedando la edición en los hechos ignorada.
    await supabase.from('productos').update({ costo: nuevoCosto, precio: nuevoPrecio }).eq('producto_maestro_id', editando.id);
    await registrarAuditoria(supabase, {
      accion: `editó el producto "${formNombre.trim()}" del catálogo`,
      entidad: 'producto_maestro',
      entidadId: editando.id,
    });
    setMaestros((prev) =>
      prev.map((m) =>
        m.id === editando.id
          ? {
              ...m,
              nombre: formNombre.trim(),
              marca: formMarca.trim() || null,
              categoria_id: formCategoriaId || null,
              costo: nuevoCosto,
              precio: nuevoPrecio,
              sku: formSku.trim() || null,
              codigo_barras: formCodigoBarras.trim() || null,
              garantia_dias: formGarantiaDias ? Number(formGarantiaDias) : null,
              stock_minimo: formStockMinimo ? Number(formStockMinimo) : null,
            }
          : m
      )
    );
    setProductos((prev) => prev.map((p) => (p.producto_maestro_id === editando.id ? { ...p, precio: nuevoPrecio } : p)));
    setGuardandoEdicion(false);
    setEditando(null);
  };

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

    // Celulares: se agrupan por modelo (no tienen producto_maestro_id, esa
    // idea es exclusiva de accesorios) — cada unidad en `dispositivos` es 1
    // unidad de stock, así que agrupar es simplemente contar filas. El
    // precio de cada unidad puede variar (estado, color, batería), así que
    // "Final" solo muestra un número cuando TODAS las unidades del grupo
    // comparten exactamente el mismo precio — mostrar cualquier otro
    // inventaría un precio único donde no lo hay.
    type GrupoDisp = { nombre: string; marca: string; categoriaId: string | null; stockTotal: number; stockSucursal: number; precios: Set<number>; imeis: string[] };
    const porClaveDisp = new Map<string, GrupoDisp>();
    for (const d of dispositivos) {
      const modelo = d.modelo || 'Sin modelo';
      const clave = `disp:${normalizar(modelo)}`;
      const actual =
        porClaveDisp.get(clave) ??
        ({ nombre: modelo, marca: marcaDeModelo(d.modelo), categoriaId: d.categoria_id, stockTotal: 0, stockSucursal: 0, precios: new Set<number>(), imeis: [] } as GrupoDisp);
      actual.stockTotal += 1;
      if (sucursalActual.id && d.sucursal_id === sucursalActual.id) actual.stockSucursal += 1;
      if (d.precio != null) actual.precios.add(d.precio);
      if (d.imei) actual.imeis.push(d.imei);
      porClaveDisp.set(clave, actual);
    }

    const resultado: FilaGrid[] = [];
    for (const [clave, info] of porClave) {
      resultado.push({
        clave,
        maestro: info.maestro,
        categoriaId: info.categoriaId,
        categoria: info.categoriaId ? nombreCategoria.get(info.categoriaId) ?? '' : '',
        marca: info.marca ?? '',
        nombre: info.nombre,
        stockTotal: info.stockTotal,
        stockSucursal: info.stockSucursal,
        final: info.precio,
        imeis: [],
      });
    }
    for (const [clave, info] of porClaveDisp) {
      resultado.push({
        clave,
        maestro: null,
        categoriaId: info.categoriaId,
        categoria: info.categoriaId ? nombreCategoria.get(info.categoriaId) ?? '' : '',
        marca: info.marca,
        nombre: info.nombre,
        stockTotal: info.stockTotal,
        stockSucursal: info.stockSucursal,
        final: info.precios.size === 1 ? [...info.precios][0] : null,
        imeis: info.imeis,
      });
    }
    resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, dispositivos, maestros, nombreCategoria, sucursalActual.id]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroCategoria && f.categoriaId !== filtroCategoria) return false;
      if (!q) return true;
      // El código de barra/SKU/IMEI se busca por coincidencia exacta
      // primero (así un lector de código de barra, que escribe el código
      // completo de una sola vez, encuentra el producto aunque el nombre
      // no tenga nada que ver con lo tipeado) y si no, por substring como
      // el resto. El IMEI es propio de cada unidad (celulares no tienen
      // catálogo maestro), así que se busca en la lista de IMEIs del grupo.
      return (
        f.nombre.toLowerCase().includes(q) ||
        f.marca.toLowerCase().includes(q) ||
        f.maestro?.sku?.toLowerCase().includes(q) ||
        f.maestro?.codigo_barras?.toLowerCase().includes(q) ||
        f.imeis.some((imei) => imei.toLowerCase().includes(q))
      );
    });
  }, [filas, busqueda, filtroCategoria]);

  const nombreSucursalActual = sucursales.find((s) => s.id === sucursalActual.id)?.nombre ?? null;

  // Exporta la grilla completa (no la filtrada por búsqueda/categoría en
  // pantalla) — mismo criterio que "Exportar" en Clientes y Stock, siempre
  // el dato completo. Incluye celulares (agrupados por modelo) porque esta
  // vista los junta con los accesorios, pero importar solo carga accesorios
  // nuevos (ver más abajo) — los celulares se siguen cargando de a uno,
  // con IMEI, desde Stock.
  const exportarCatalogo = async (formato: 'csv' | 'xlsx') => {
    setExportando(true);
    setResultadoImport(null);
    try {
      await descargarDatos(
        'productos-qovento',
        ['categoria', 'marca', 'nombre', 'stock_total', 'stock_sucursal', 'precio'],
        filas.map((f) => ({
          categoria: f.categoria,
          marca: f.marca,
          nombre: f.nombre,
          stock_total: f.stockTotal,
          stock_sucursal: f.stockSucursal,
          precio: f.final ?? '',
        })),
        formato
      );
    } catch (err: any) {
      setResultadoImport(t('No pudimos exportar:') + ' ' + (err?.message ?? t('error desconocido')));
    }
    setExportando(false);
  };

  // Carga accesorios nuevos en bloque (no celulares — esos necesitan IMEI y
  // se siguen cargando de a uno desde Stock). Cada fila puede necesitar
  // crear un producto_maestro nuevo (nombre+marca no existía en el
  // catálogo) antes de poder insertar su stock — por eso se resuelve fila
  // por fila en un for secuencial (para no crear el mismo maestro dos veces
  // si el archivo repite un nombre) y recién después se insertan todas las
  // filas de stock juntas, en tandas.
  const importarProductos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setImportando(true);
    setResultadoImport(null);
    setProgresoImport(null);

    try {
      const filasArchivo = await leerArchivoDatos(archivo);
      const normalizar = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
      const categoriasPorNombre = new Map(categorias.map((c) => [normalizar(c.nombre), c.id]));
      const maestrosPorClave = new Map(maestros.map((m) => [`${normalizar(m.nombre)}|${normalizar(m.marca)}`, m.id]));
      const sucursalId = sucursalActual.id || null;
      const clavesYaEnSucursal = new Set(
        productos.filter((p) => p.sucursal_id === sucursalId).map((p) => `${normalizar(p.nombre)}|${normalizar(p.marca)}`)
      );

      let omitidosSinNombre = 0;
      let omitidosDuplicados = 0;
      const nuevasFilas: Record<string, unknown>[] = [];

      for (const fila of filasArchivo) {
        const nombre = valorDe(fila, 'nombre', 'producto', 'name');
        if (!nombre) {
          omitidosSinNombre++;
          continue;
        }
        const marca = valorDe(fila, 'marca', 'brand') || null;
        const clave = `${normalizar(nombre)}|${normalizar(marca)}`;
        if (clavesYaEnSucursal.has(clave)) {
          omitidosDuplicados++;
          continue;
        }

        const categoriaTexto = valorDe(fila, 'categoria', 'categoría', 'category');
        const categoriaId = categoriaTexto ? categoriasPorNombre.get(normalizar(categoriaTexto)) ?? null : null;
        // sanitizarDecimal acepta tanto "1500.50" como "1500,50" (formato
        // argentino) — sin esto, un precio con coma decimal daba NaN/null en
        // silencio (mismo bug ya corregido en los inputs manuales de esta
        // pantalla, líneas 643 y 652, que faltaba aplicar acá).
        const precioTexto = valorDe(fila, 'precio', 'price');
        const precio = precioTexto ? Number(sanitizarDecimal(precioTexto)) : null;
        const costoTexto = valorDe(fila, 'costo', 'cost');
        const costo = costoTexto ? Number(sanitizarDecimal(costoTexto)) : null;
        const cantidadTexto = valorDe(fila, 'cantidad', 'stock_total', 'stock', 'quantity');
        const cantidad = cantidadTexto ? Math.max(0, Math.floor(Number(sanitizarDecimal(cantidadTexto)) || 0)) : 0;

        let productoMaestroId = maestrosPorClave.get(clave) ?? null;
        if (!productoMaestroId) {
          const resultadoMaestro = await crearProductoMaestro(supabase, { nombre, marca, categoriaId, precio, costo });
          if ('error' in resultadoMaestro) {
            // Ej. dos filas del archivo con el mismo nombre+marca, o alguien
            // más lo cargó justo ahora — se omite solo esta fila, no se
            // corta todo el import por un choque puntual.
            omitidosDuplicados++;
            continue;
          }
          productoMaestroId = resultadoMaestro.id;
          maestrosPorClave.set(clave, productoMaestroId);
        }

        nuevasFilas.push({
          nombre,
          marca,
          categoria_id: categoriaId,
          precio,
          costo,
          cantidad,
          producto_maestro_id: productoMaestroId,
          ...(sucursalId ? { sucursal_id: sucursalId } : {}),
        });
        clavesYaEnSucursal.add(clave);
      }

      const { guardadas, error } = await insertarEnTandas(
        (tanda) => supabase.from('productos').insert(tanda),
        nuevasFilas,
        300,
        (hechas, total) => setProgresoImport({ hechas, total })
      );

      const omitidos = omitidosSinNombre + omitidosDuplicados;
      setResultadoImport(
        error
          ? `${t('Se guardaron')} ${guardadas} ${t('de')} ${nuevasFilas.length} ${t('antes de un error:')} ${error}`
          : `${t('Listo: se importaron')} ${guardadas} ${t('productos.')}${
              omitidos > 0 ? ` ${t('Se omitieron')} ${omitidos} ${t('filas sin nombre o ya cargadas en esta sucursal.')}` : ''
            }`
      );

      if (guardadas > 0) {
        await registrarAuditoria(supabase, { accion: `importó ${guardadas} productos desde un archivo`, entidad: 'producto' });
        const [productosActualizados, maestrosActualizados] = await Promise.all([
          obtenerTodasLasFilas<ProductoFila>(
            supabase,
            'productos',
            'id, nombre, marca, categoria_id, precio, cantidad, sucursal_id, producto_maestro_id',
            [{ columna: 'nombre' }]
          ),
          obtenerProductosMaestro(supabase, false),
        ]);
        setProductos(productosActualizados);
        setMaestros(maestrosActualizados);
      }
    } catch (err: any) {
      setResultadoImport(t('No pudimos leer el archivo:') + ' ' + (err?.message ?? t('error desconocido')));
    }

    setImportando(false);
    setProgresoImport(null);
    if (inputImportRef.current) inputImportRef.current.value = '';
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/" className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t('Productos')}</h1>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {t('Vista de todo el catálogo. Tocá el ✏️ de una fila para editar categoría, marca, costo, precio y más — la cantidad se sigue ajustando desde Stock.')}
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
          placeholder={t('Buscar producto, marca, IMEI o código de barra...')}
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
        {puedeAgregarStock && (
          <label className="shrink-0 rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium cursor-pointer">
            ⬆{' '}
            {importando
              ? progresoImport
                ? `${t('Importando...')} ${progresoImport.hechas}/${progresoImport.total}`
                : t('Leyendo archivo...')
              : t('Importar CSV o Excel')}
            <input
              ref={inputImportRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={importando}
              onChange={importarProductos}
            />
          </label>
        )}
        <button
          onClick={() => exportarCatalogo('csv')}
          disabled={filas.length === 0 || exportando}
          className="shrink-0 rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          ⬇ {exportando ? t('Exportando...') : t('Exportar CSV')}
        </button>
        <button
          onClick={() => exportarCatalogo('xlsx')}
          disabled={filas.length === 0 || exportando}
          className="shrink-0 rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          ⬇ {exportando ? t('Exportando...') : t('Exportar Excel')}
        </button>
      </div>

      {resultadoImport && (
        <p className="text-sm bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2">{resultadoImport}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      ) : filasFiltradas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No hay productos que coincidan.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface dark:bg-dark-surface text-left text-xs uppercase text-muted dark:text-dark-text-secondary">
                <th className="px-3 py-2 font-medium">{t('Categoría')}</th>
                <th className="px-3 py-2 font-medium">{t('Marca')}</th>
                <th className="px-3 py-2 font-medium">{t('Producto')}</th>
                <th className="px-3 py-2 font-medium text-right">{sucursales.length > 1 ? t('Stock Total') : t('Stock')}</th>
                {sucursales.length > 1 && (
                  <th className="px-3 py-2 font-medium text-right">
                    {t('Stock Sucursal')}
                    {nombreSucursalActual ? ` (${nombreSucursalActual})` : ''}
                  </th>
                )}
                <th className="px-3 py-2 font-medium text-right">{t('Final')}</th>
                {puedeAgregarStock && <th className="px-3 py-2 font-medium text-right">{t('Editar')}</th>}
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <tr key={f.clave} className="border-t border-border dark:border-dark-border">
                  <td className="px-3 py-2 text-muted dark:text-dark-text-secondary">{f.categoria || '—'}</td>
                  <td className="px-3 py-2">{f.marca || '—'}</td>
                  <td className="px-3 py-2 font-medium">{f.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.stockTotal}</td>
                  {sucursales.length > 1 && (
                    <td className="px-3 py-2 text-right tabular-nums">{sucursalActual.id ? f.stockSucursal : f.stockTotal}</td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{f.final != null ? `$${f.final.toLocaleString()}` : '—'}</td>
                  {puedeAgregarStock && (
                    <td className="px-3 py-2 text-right">
                      {f.maestro ? (
                        <button
                          onClick={() => abrirEdicion(f.maestro!)}
                          aria-label={t('Editar')}
                          className="text-accent dark:text-dark-accent hover:opacity-70"
                        >
                          ✏️
                        </button>
                      ) : (
                        <Link href="/stock" className="text-xs text-accent dark:text-dark-accent hover:underline">
                          {t('Stock')}
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <Modal titulo={t('Editar producto')} onClose={() => setEditando(null)} maxWidth="max-w-lg">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Nombre')}</label>
                <input
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Marca')}</label>
                <input
                  value={formMarca}
                  onChange={(e) => setFormMarca(e.target.value)}
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Categoría')}</label>
                <select
                  value={formCategoriaId}
                  onChange={(e) => setFormCategoriaId(e.target.value)}
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('Sin categoría')}</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Costo')}</label>
                <input
                  value={formCosto}
                  onChange={(e) => setFormCosto(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Final')}</label>
                <input
                  value={formPrecio}
                  onChange={(e) => setFormPrecio(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">SKU</label>
                <input
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Código de barras')}</label>
                <input
                  value={formCodigoBarras}
                  onChange={(e) => setFormCodigoBarras(e.target.value)}
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Garantía (días)')}</label>
                <input
                  value={formGarantiaDias}
                  onChange={(e) => setFormGarantiaDias(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Stock mínimo')}</label>
                <input
                  value={formStockMinimo}
                  onChange={(e) => setFormStockMinimo(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  className="w-full bg-white dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            {errorEdicion && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2">{errorEdicion}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditando(null)}
                className="rounded-lg border border-border dark:border-dark-border px-4 py-2 text-sm font-medium"
              >
                {t('Cancelar')}
              </button>
              <button
                onClick={guardarEdicion}
                disabled={guardandoEdicion}
                className="rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {guardandoEdicion ? t('Guardando...') : t('Guardar')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
