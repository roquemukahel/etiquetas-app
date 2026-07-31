'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { hexColorDe } from '../lib/coloresIphone';
import MiniaturaDispositivo from '../MiniaturaDispositivo';

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

type Producto = { id: string; nombre: string; precio: number | null; imagen_url: string | null };

export default function Stock() {
  const supabase = crearClienteNavegador();
  const [tab, setTab] = useState<'celulares' | 'accesorios'>('celulares');

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [nombreProducto, setNombreProducto] = useState('');
  const [precioProducto, setPrecioProducto] = useState('');
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [errorProducto, setErrorProducto] = useState<string | null>(null);

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('*').order('nombre');
    setProductos((data as Producto[]) ?? []);
    setLoadingProductos(false);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('dispositivos')
        .select('*')
        .order('modelo', { ascending: true })
        .order('created_at', { ascending: false });
      setDispositivos((data as Dispositivo[]) ?? []);
      setLoading(false);
    })();
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
      if (!verTodos && !d.en_stock) return false;
      if (!q) return true;
      return [d.modelo, d.imei, d.numero_serie, d.color]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q));
    });
  }, [dispositivos, busqueda, verTodos]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Dispositivo[]>();
    if (!busqueda.trim()) {
      for (const nombre of carpetas) mapa.set(nombre, []);
    }
    for (const d of filtrados) {
      const clave = d.modelo || 'Sin modelo';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(d);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados, carpetas, busqueda]);

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
              onClick={() => setVerTodos(false)}
              className={`flex-1 rounded-xl py-2 font-medium ${
                !verTodos ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              En stock
            </button>
            <button
              onClick={() => setVerTodos(true)}
              className={`flex-1 rounded-xl py-2 font-medium ${
                verTodos ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              Historial completo
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

          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

          {!loading && grupos.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {busqueda ? 'No encontramos nada con esa búsqueda.' : 'Todavía no tenés dispositivos cargados.'}
            </p>
          )}

          <div className="flex flex-col gap-5">
            {grupos.map(([modelo, items]) => {
              const enStock = conteoEnStockPorModelo.get(modelo) ?? 0;
              return (
              <div key={modelo} className="flex flex-col gap-2">
                <p className="text-xs text-muted dark:text-dark-text-secondary font-medium flex items-center gap-2">
                  <MiniaturaDispositivo src={imagenPorNombreExacto(modelo, imagenesCarpetas)} size={24} />
                  <span>
                    {modelo} · {items.length}
                  </span>
                  {enStock > 0 && enStock < 3 && (
                    <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5">
                      ⚠ Quedan {enStock} — reponer
                    </span>
                  )}
                </p>
                {items.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary italic">Carpeta vacía, todavía sin dispositivos.</p>
                )}
                <div className="flex flex-col gap-2">
                  {items.map((d) => {
                    const colorHex = hexColorDe(d.color);
                    return (
                    <Link
                      key={d.id}
                      href={`/stock/${d.id}`}
                      style={colorHex ? { borderColor: colorHex } : undefined}
                      className={`rounded-xl border-[3px] ${colorHex ? '' : 'border-border dark:border-dark-border'} px-4 py-3 flex items-center gap-3 ${
                        d.en_stock ? 'bg-white dark:bg-dark-surface' : 'bg-white dark:bg-dark-surface opacity-60'
                      }`}
                    >
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
                    </Link>
                    );
                  })}
                </div>
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
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3"
              >
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
            ))}
          </div>
        </>
      )}
    </main>
  );
}
