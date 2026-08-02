'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { hexColorDe } from '../lib/coloresIphone';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor } from '../lib/actor';
import { leerCSV, valorDe, descargarCSV, insertarEnTandas } from '../lib/csv';
import { obtenerTodasLasFilas } from '../lib/db';
import MiniaturaDispositivo from '../MiniaturaDispositivo';

// Cuando el CSV viene de otro sistema y no separó el IMEI, la batería ni la
// capacidad en columnas propias, suelen venir mezclados en un texto libre
// (ej. "iPhone 11 Black 128GB 73% de bateria imei: 353968107575889"). Estas
// funciones los rescatan con expresiones regulares — no son perfectas, pero
// cubren el patrón que se ve en la práctica.
function extraerImei(texto: string): string | null {
  const m = texto.match(/imei[:\s]*([0-9]{6,17})/i) || texto.match(/\b(\d{15})\b/);
  return m ? m[1] : null;
}
function extraerBateria(texto: string): number | null {
  const m = texto.match(/(\d{1,3})\s?%/);
  return m ? Number(m[1]) : null;
}
function extraerCapacidad(texto: string): number | null {
  const m = texto.match(/(\d+)\s?gb/i);
  return m ? Number(m[1]) : null;
}

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  numero_serie: string | null;
  salud_bateria: number | null;
  color: string | null;
  precio: number | null;
  estado: string | null;
  en_stock: boolean;
  created_at: string;
};

type Producto = { id: string; nombre: string; precio: number | null; imagen_url: string | null; cantidad: number };

export default function Stock() {
  const supabase = crearClienteNavegador();
  const [tab, setTab] = useState<'celulares' | 'accesorios'>('celulares');

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'stock' | 'vendidos'>('stock');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [nombreProducto, setNombreProducto] = useState('');
  const [precioProducto, setPrecioProducto] = useState('');
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [errorProducto, setErrorProducto] = useState<string | null>(null);
  const [editandoCantidad, setEditandoCantidad] = useState<string | null>(null);
  const [valorCantidad, setValorCantidad] = useState('');
  const [preparando, setPreparando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const [planImport, setPlanImport] = useState<{
    filas: Record<string, unknown>[];
    totalCSV: number;
    omitidosSinModelo: number;
    omitidosDuplicado: number;
  } | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);

  // En "Vendidos" las carpetas arrancan cerradas (pueden acumular cientos de
  // unidades del mismo modelo) y se abren una por una al tocarlas. En "En
  // stock"/"Historial" arrancan abiertas, como siempre. gruposAlternados
  // guarda qué carpetas se tocaron manualmente, invirtiendo el default de la
  // vista actual.
  const [gruposAlternados, setGruposAlternados] = useState<Set<string>>(new Set());

  useEffect(() => {
    setGruposAlternados(new Set());
  }, [vista]);

  const grupoExpandido = (modelo: string) => {
    const porDefecto = vista !== 'vendidos';
    return gruposAlternados.has(modelo) ? !porDefecto : porDefecto;
  };

  const toggleGrupo = (modelo: string) => {
    setGruposAlternados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(modelo)) nuevo.delete(modelo);
      else nuevo.add(modelo);
      return nuevo;
    });
  };

  const [eliminandoCarpeta, setEliminandoCarpeta] = useState<string | null>(null);

  const eliminarCarpeta = async (modelo: string, items: Dispositivo[]) => {
    if (items.length === 0) return;
    if (
      !confirm(
        `¿Eliminar los ${items.length} dispositivo${items.length === 1 ? '' : 's'} de "${modelo}"? No se puede deshacer.`
      )
    )
      return;

    setEliminandoCarpeta(modelo);
    const { error } = await supabase.from('dispositivos').delete().in('id', items.map((d) => d.id));
    if (!error) {
      await registrarAuditoria(supabase, {
        accion: `eliminó toda la carpeta "${modelo}" de Stock (${items.length} dispositivo${items.length === 1 ? '' : 's'})`,
        entidad: 'dispositivo',
      });
    }
    setEliminandoCarpeta(null);
    cargarDispositivos();
  };

  const cargarProductos = async () => {
    const data = await obtenerTodasLasFilas<Producto>(supabase, 'productos', '*', [{ columna: 'nombre' }]);
    setProductos(data);
    setLoadingProductos(false);
  };

  const cargarDispositivos = async () => {
    const data = await obtenerTodasLasFilas<Dispositivo>(supabase, 'dispositivos', '*', [
      { columna: 'modelo' },
      { columna: 'created_at', ascending: false },
    ]);
    setDispositivos(data);
    setLoading(false);
  };

  const exportarDispositivos = () => {
    descargarCSV(
      'stock-celulares-qovento.csv',
      ['modelo', 'capacidad_gb', 'color', 'imei', 'numero_serie', 'salud_bateria', 'precio', 'estado', 'en_stock', 'created_at'],
      dispositivos
    );
  };

  const prepararImportacion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setPreparando(true);
    setResultadoImport(null);
    setPlanImport(null);

    try {
      const filas = await leerCSV(archivo);
      const imeisExistentes = new Set(dispositivos.map((d) => d.imei).filter(Boolean));
      let omitidosSinModelo = 0;
      let omitidosDuplicado = 0;

      const nuevos = filas
        .map((fila) => {
          const modelo = valorDe(fila, 'modelo', 'category') || null;
          const textoLibre = [valorDe(fila, 'name'), valorDe(fila, 'description')].filter(Boolean).join(' ');

          const imeiDirecto = valorDe(fila, 'imei');
          const imei = imeiDirecto || extraerImei(textoLibre);

          const bateriaDirecta = valorDe(fila, 'salud_bateria', 'bateria');
          const salud_bateria = bateriaDirecta ? Number(bateriaDirecta) : extraerBateria(textoLibre);

          const capacidadDirecta = valorDe(fila, 'capacidad_gb', 'capacidad');
          const capacidad_gb = capacidadDirecta ? Number(capacidadDirecta) : extraerCapacidad(`${modelo || ''} ${textoLibre}`);

          const precioTexto = valorDe(fila, 'precio', 'price');
          const precio = precioTexto ? Number(precioTexto) : null;

          const cantidadTexto = valorDe(fila, 'quantity');
          const enStockTexto = valorDe(fila, 'en_stock');
          const en_stock = enStockTexto
            ? ['true', '1', 'si', 'sí'].includes(enStockTexto.toLowerCase())
            : cantidadTexto
            ? Number(cantidadTexto) > 0
            : true;

          const creadoTexto = valorDe(fila, 'created_at', 'createdat');
          const fechaCreado = creadoTexto ? new Date(creadoTexto) : null;

          if (!modelo) {
            omitidosSinModelo++;
            return null;
          }

          const actor = getActor();
          return {
            modelo,
            capacidad_gb: capacidad_gb || null,
            color: valorDe(fila, 'color') || null,
            imei: imei || null,
            numero_serie: valorDe(fila, 'numero_serie', 'serial') || null,
            salud_bateria,
            precio,
            estado: valorDe(fila, 'estado') || 'usado',
            en_stock,
            proveedor: valorDe(fila, 'proveedor') || null,
            agregado_por_nombre: actor?.nombre ?? null,
            agregado_por_foto_url: actor?.fotoUrl ?? null,
            ...(fechaCreado && !isNaN(fechaCreado.getTime()) ? { created_at: fechaCreado.toISOString() } : {}),
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .filter((d) => {
          // imeisExistentes se va completando con cada fila aceptada, así
          // que si el mismo CSV trae el mismo IMEI dos veces (típico al
          // re-exportar de otro sistema), la segunda también se detecta
          // como duplicada — antes solo se comparaba contra el stock ya
          // cargado, y ambas filas pasaban.
          const esDuplicado = !!d.imei && imeisExistentes.has(d.imei);
          if (esDuplicado) {
            omitidosDuplicado++;
            return false;
          }
          if (d.imei) imeisExistentes.add(d.imei);
          return true;
        });

      setPlanImport({ filas: nuevos, totalCSV: filas.length, omitidosSinModelo, omitidosDuplicado });
    } catch (err: any) {
      setResultadoImport('No pudimos leer el archivo: ' + (err?.message ?? 'error desconocido'));
    }

    setPreparando(false);
    if (inputImportRef.current) inputImportRef.current.value = '';
  };

  const confirmarImportacion = async () => {
    if (!planImport) return;
    setImportando(true);
    setProgresoImport(null);

    const { guardadas, error } = await insertarEnTandas(
      (tanda) => supabase.from('dispositivos').insert(tanda),
      planImport.filas,
      500,
      (hechas, total) => setProgresoImport({ hechas, total })
    );

    setResultadoImport(
      error
        ? `Se guardaron ${guardadas} de ${planImport.filas.length} antes de un error: ${error}`
        : `Listo: se importaron ${guardadas} dispositivos.`
    );
    setPlanImport(null);
    setImportando(false);
    setProgresoImport(null);
    cargarDispositivos();
  };

  const cancelarImportacion = () => {
    setPlanImport(null);
    setResultadoImport(null);
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const salirDeSeleccion = () => {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  };

  const eliminarSeleccionados = async () => {
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} dispositivo${ids.length === 1 ? '' : 's'} del historial? No se puede deshacer.`)) return;

    setEliminandoSeleccion(true);
    const aEliminar = dispositivos.filter((d) => seleccionados.has(d.id));

    const { error } = await supabase.from('dispositivos').delete().in('id', ids);
    if (!error) {
      for (const d of aEliminar) {
        await registrarAuditoria(supabase, {
          accion: `eliminó el dispositivo ${d.modelo || 'sin modelo'}${d.imei ? ` (IMEI ${d.imei})` : ''} del historial`,
          entidad: 'dispositivo',
          entidadId: d.id,
        });
      }
    }

    setEliminandoSeleccion(false);
    salirDeSeleccion();
    cargarDispositivos();
  };

  useEffect(() => {
    cargarDispositivos();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
    cargarProductos();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return dispositivos.filter((d) => {
      if (vista === 'stock' && !d.en_stock) return false;
      if (vista === 'vendidos' && d.en_stock) return false;
      if (!q) return true;
      return [d.modelo, d.imei, d.numero_serie, d.color]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q));
    });
  }, [dispositivos, busqueda, vista]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Dispositivo[]>();
    if (!busqueda.trim() && vista !== 'vendidos') {
      for (const nombre of carpetas) mapa.set(nombre, []);
    }
    for (const d of filtrados) {
      const clave = d.modelo || 'Sin modelo';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(d);
    }
    // Dentro de cada carpeta, agrupados por capacidad ascendente (todos los
    // de 128GB primero, después todos los de 256GB, etc.) en vez de mezclados
    // por fecha de carga.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.capacidad_gb ?? Infinity) - (b.capacidad_gb ?? Infinity));
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados, carpetas, busqueda, vista]);

  // Para la alerta de reposición contamos el stock real de cada modelo,
  // sin importar qué pestaña (En stock / Historial) esté activa.
  const conteoEnStockPorModelo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of dispositivos) {
      if (!d.en_stock) continue;
      const clave = d.modelo || 'Sin modelo';
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  }, [dispositivos]);

  const agregarProducto = async () => {
    if (!nombreProducto.trim()) return;
    setGuardandoProducto(true);
    setErrorProducto(null);
    const { error: insertError } = await supabase
      .from('productos')
      .insert({ nombre: nombreProducto.trim(), precio: precioProducto ? Number(precioProducto) : null });
    if (insertError) {
      setErrorProducto('No pudimos guardar: ' + insertError.message);
      setGuardandoProducto(false);
      return;
    }
    setNombreProducto('');
    setPrecioProducto('');
    setGuardandoProducto(false);
    cargarProductos();
  };

  const eliminarProducto = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await supabase.from('productos').delete().eq('id', id);
    cargarProductos();
  };

  const abrirEdicionCantidad = (p: Producto) => {
    setEditandoCantidad(editandoCantidad === p.id ? null : p.id);
    setValorCantidad(String(p.cantidad));
  };

  const guardarCantidad = async (p: Producto) => {
    const nueva = Number(valorCantidad) || 0;
    if (nueva === p.cantidad) {
      setEditandoCantidad(null);
      return;
    }
    await supabase.from('productos').update({ cantidad: nueva }).eq('id', p.id);
    await registrarAuditoria(supabase, {
      accion: `cambió el stock de "${p.nombre}" de ${p.cantidad} a ${nueva} unidades`,
      entidad: 'producto',
      entidadId: p.id,
      valorAnterior: { cantidad: p.cantidad },
      valorNuevo: { cantidad: nueva },
    });
    setEditandoCantidad(null);
    cargarProductos();
  };

  const cambiarImagenProducto = (p: Producto, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, imagen_url: dataUrl } : x)));
      await supabase.from('productos').update({ imagen_url: dataUrl }).eq('id', p.id);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Stock</span>
        {tab === 'celulares' && (
          <Link href="/stock/carpetas" className="text-xs text-accent dark:text-dark-accent underline">
            Carpetas
          </Link>
        )}
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setTab('celulares')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'celulares' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Celulares
        </button>
        <button
          onClick={() => setTab('accesorios')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'accesorios' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Accesorios
        </button>
      </div>

      {tab === 'celulares' ? (
        <>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por modelo, IMEI, serie, código..."
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />

          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setVista('stock')}
              className={`flex-1 rounded-xl py-2 font-medium ${
                vista === 'stock' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              En stock
            </button>
            <button
              onClick={() => setVista('vendidos')}
              className={`flex-1 rounded-xl py-2 font-medium ${
                vista === 'vendidos' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              Vendidos
            </button>
          </div>

          <div className="flex gap-2">
            <Link
              href="/stock/nuevo"
              className="flex-1 rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
            >
              + Cargar a mano
            </Link>
            <Link
              href="/stock/foto"
              className="flex-1 rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
            >
              + Cargar con foto
            </Link>
          </div>

          <div className="flex gap-2">
            <label className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium cursor-pointer">
              {preparando
                ? 'Leyendo archivo...'
                : importando
                ? progresoImport
                  ? `Importando... ${progresoImport.hechas}/${progresoImport.total}`
                  : 'Importando...'
                : '⬆ Importar CSV'}
              <input
                ref={inputImportRef}
                type="file"
                accept=".csv"
                className="hidden"
                disabled={preparando || importando}
                onChange={prepararImportacion}
              />
            </label>
            <button
              onClick={exportarDispositivos}
              disabled={dispositivos.length === 0}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
            >
              ⬇ Exportar CSV
            </button>
          </div>

          {planImport && (
            <div className="rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft p-3.5 flex flex-col gap-2.5">
              <p className="text-sm font-medium">Revisá antes de confirmar</p>
              <ul className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-1">
                <li>El archivo tiene {planImport.totalCSV} filas.</li>
                <li>
                  Se van a importar <strong className="text-ink dark:text-dark-text">{planImport.filas.length}</strong> dispositivos
                  nuevos.
                </li>
                {planImport.omitidosDuplicado > 0 && (
                  <li>
                    Se omiten <strong className="text-ink dark:text-dark-text">{planImport.omitidosDuplicado}</strong> por tener el
                    mismo IMEI que uno que ya tenés cargado (para no duplicar).
                  </li>
                )}
                {planImport.omitidosSinModelo > 0 && (
                  <li>Se omiten {planImport.omitidosSinModelo} filas sin modelo reconocible.</li>
                )}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={cancelarImportacion}
                  disabled={importando}
                  className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarImportacion}
                  disabled={importando || planImport.filas.length === 0}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  {importando
                    ? progresoImport
                      ? `Importando... ${progresoImport.hechas}/${progresoImport.total}`
                      : 'Importando...'
                    : `Confirmar e importar ${planImport.filas.length}`}
                </button>
              </div>
            </div>
          )}

          {resultadoImport && (
            <p className="text-xs bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2 text-muted dark:text-dark-text-secondary">
              {resultadoImport}
            </p>
          )}

          {modoSeleccion ? (
            <div className="sticky top-0 z-10 rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-4 py-2.5 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}</p>
              <div className="flex items-center gap-2">
                <button onClick={salirDeSeleccion} className="text-xs text-muted dark:text-dark-text-secondary underline">
                  Cancelar
                </button>
                <button
                  onClick={eliminarSeleccionados}
                  disabled={seleccionados.size === 0 || eliminandoSeleccion}
                  className="rounded-lg bg-bad text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                >
                  {eliminandoSeleccion ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setModoSeleccion(true)}
              className="self-start text-xs text-accent dark:text-dark-accent underline"
            >
              Seleccionar varios
            </button>
          )}

          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

          {!loading && grupos.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {busqueda
                ? 'No encontramos nada con esa búsqueda.'
                : vista === 'vendidos'
                ? 'Todavía no marcaste ningún dispositivo como vendido.'
                : 'Todavía no tenés dispositivos cargados.'}
            </p>
          )}

          <div className="flex flex-col gap-5">
            {grupos.map(([modelo, items]) => {
              const enStock = conteoEnStockPorModelo.get(modelo) ?? 0;
              const expandido = items.length === 0 || grupoExpandido(modelo);
              return (
              <div key={modelo} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => items.length > 0 && toggleGrupo(modelo)}
                    className="text-sm text-muted dark:text-dark-text-secondary font-medium flex items-center gap-2.5 text-left flex-1 min-w-0"
                  >
                    {items.length > 0 && <span className="shrink-0">{expandido ? '▾' : '▸'}</span>}
                    <MiniaturaDispositivo src={imagenPorNombreExacto(modelo, imagenesCarpetas)} size={48} />
                    <span className="truncate">
                      {modelo} · {items.length}
                    </span>
                    {enStock > 0 && enStock < 3 && (
                      <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5 shrink-0">
                        ⚠ Quedan {enStock} — reponer
                      </span>
                    )}
                  </button>
                  {items.length > 0 && (
                    <button
                      onClick={() => eliminarCarpeta(modelo, items)}
                      disabled={eliminandoCarpeta === modelo}
                      className="shrink-0 text-xs text-bad underline disabled:opacity-40"
                    >
                      {eliminandoCarpeta === modelo ? 'Eliminando...' : 'Eliminar carpeta'}
                    </button>
                  )}
                </div>
                {items.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary italic">Carpeta vacía, todavía sin dispositivos.</p>
                )}
                {expandido && <div className="flex flex-col gap-2">
                  {items.map((d) => {
                    const colorHex = hexColorDe(d.color);
                    const seleccionado = seleccionados.has(d.id);
                    const clases = `rounded-xl border-[3px] ${colorHex ? '' : 'border-border dark:border-dark-border'} px-4 py-3 flex items-center gap-3 w-full text-left ${
                      d.en_stock ? 'bg-white dark:bg-dark-surface' : 'bg-white dark:bg-dark-surface opacity-60'
                    } ${seleccionado ? 'ring-2 ring-accent dark:ring-dark-accent' : ''}`;
                    const contenido = (
                      <>
                        {modoSeleccion && (
                          <span
                            className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              seleccionado
                                ? 'bg-accent dark:bg-dark-accent border-accent dark:border-dark-accent'
                                : 'border-border dark:border-dark-border'
                            }`}
                          >
                            {seleccionado && <span className="text-white text-[10px]">✓</span>}
                          </span>
                        )}
                        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                              <span>
                                {d.capacidad_gb ? `${d.capacidad_gb} GB` : 'Capacidad s/d'}
                                {d.color ? ` · ${d.color}` : ''}
                                {d.salud_bateria != null ? ` · ${d.salud_bateria}%` : ''}
                              </span>
                              {d.salud_bateria != null && d.salud_bateria < 80 && (
                                <span className="text-[10px] font-semibold text-warn bg-warn/10 rounded-full px-2 py-0.5">
                                  ⚠ Batería baja
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted dark:text-dark-text-secondary">
                              IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{d.imei || 'sin IMEI'}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            {d.precio != null && (
                              <p className="text-sm font-medium">${d.precio.toLocaleString('es-AR')}</p>
                            )}
                            <p className="text-xs text-muted dark:text-dark-text-secondary">{d.en_stock ? 'en stock' : 'fuera de stock'}</p>
                          </div>
                        </div>
                      </>
                    );

                    return modoSeleccion ? (
                      <button
                        key={d.id}
                        onClick={() => toggleSeleccion(d.id)}
                        style={colorHex ? { borderColor: colorHex } : undefined}
                        className={clases}
                      >
                        {contenido}
                      </button>
                    ) : (
                      <Link key={d.id} href={`/stock/${d.id}`} style={colorHex ? { borderColor: colorHex } : undefined} className={clases}>
                        {contenido}
                      </Link>
                    );
                  })}
                </div>}
              </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {errorProducto && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{errorProducto}</p>}

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={nombreProducto}
                onChange={(e) => setNombreProducto(e.target.value)}
                placeholder="Nombre (ej. Funda, AirPods)"
                className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
              <input
                value={precioProducto}
                onChange={(e) => setPrecioProducto(e.target.value)}
                placeholder="Precio"
                inputMode="numeric"
                className="w-24 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <button
              disabled={!nombreProducto.trim() || guardandoProducto}
              onClick={agregarProducto}
              className="w-full rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Agregar al catálogo
            </button>
          </div>

          {loadingProductos && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
          {!loadingProductos && productos.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no cargaste productos.</p>
          )}

          <div className="flex flex-col gap-2">
            {productos.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-3">
                  <label className="shrink-0 cursor-pointer">
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt={p.nombre} className="h-11 w-11 rounded-lg object-cover border border-border dark:border-dark-border" />
                    ) : (
                      <div className="h-11 w-11 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-lg">
                        📷
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarImagenProducto(p, e)} />
                  </label>
                  <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                    <p className="text-sm font-medium">{p.nombre}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.precio != null && <p className="text-sm text-muted dark:text-dark-text-secondary">${p.precio.toLocaleString('es-AR')}</p>}
                      <button onClick={() => eliminarProducto(p.id)} className="text-xs text-bad underline">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pl-14">
                  {editandoCantidad === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={valorCantidad}
                        onChange={(e) => setValorCantidad(e.target.value)}
                        inputMode="numeric"
                        autoFocus
                        className="w-16 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                      />
                      <button onClick={() => guardarCantidad(p)} className="text-xs text-accent dark:text-dark-accent underline">
                        Guardar
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => abrirEdicionCantidad(p)} className="text-xs text-muted dark:text-dark-text-secondary underline decoration-dotted">
                      Stock: <span className="font-medium text-ink dark:text-dark-text">{p.cantidad}</span> unidad{p.cantidad === 1 ? '' : 'es'}
                    </button>
                  )}
                  {p.cantidad === 0 && (
                    <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5">Sin stock</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
