'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  precio: number | null;
  imei: string | null;
};

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
};

type Vendedor = { id: string; nombre: string };
type Producto = { id: string; nombre: string; precio: number | null };

type ItemCarrito = {
  tempId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  dispositivoId?: string;
};

const STORAGE_OPTIONS = [64, 128, 256, 512];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];
const ESTADOS_ORDEN = ['pendiente', 'pagado', 'entregado'];

function idTemporal() {
  return Math.random().toString(36).slice(2);
}

export default function NuevaOrden() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [step, setStep] = useState<'cliente' | 'carrito' | 'confirmar'>('cliente');

  // --- cliente ---
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');

  // --- carrito ---
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [panelAbierto, setPanelAbierto] = useState<'dispositivo' | 'producto' | null>(null);

  const [dispositivosStock, setDispositivosStock] = useState<Dispositivo[]>([]);
  const [buscarDispositivo, setBuscarDispositivo] = useState('');
  const [modoDispositivo, setModoDispositivo] = useState<'stock' | 'nuevo'>('stock');
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoPrecioDispositivo, setNuevoPrecioDispositivo] = useState('');
  const [cargandoDispositivo, setCargandoDispositivo] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [modoProducto, setModoProducto] = useState<'catalogo' | 'manual'>('catalogo');
  const [productoManualNombre, setProductoManualNombre] = useState('');
  const [productoManualPrecio, setProductoManualPrecio] = useState('');
  const [productoManualCantidad, setProductoManualCantidad] = useState('1');

  // --- confirmar ---
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [anticipo, setAnticipo] = useState('');
  const [impuesto, setImpuesto] = useState('');
  const [estadoOrden, setEstadoOrden] = useState('pendiente');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clientes').select('*');
      setClientes((data as Cliente[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('dispositivos').select('*').eq('en_stock', true);
      setDispositivosStock((data as Dispositivo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('productos').select('*').order('nombre');
      setProductos((data as Producto[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('vendedores').select('*').order('nombre');
      setVendedores((data as Vendedor[]) ?? []);
    })();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const idsEnCarrito = useMemo(
    () => new Set(carrito.map((i) => i.dispositivoId).filter(Boolean)),
    [carrito]
  );

  const dispositivosFiltrados = useMemo(() => {
    const q = buscarDispositivo.trim().toLowerCase();
    return dispositivosStock
      .filter((d) => !idsEnCarrito.has(d.id))
      .filter((d) => !q || [d.modelo, d.imei].filter(Boolean).some((c) => c!.toLowerCase().includes(q)));
  }, [dispositivosStock, buscarDispositivo, idsEnCarrito]);

  const subtotal = useMemo(
    () => carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0),
    [carrito]
  );
  const total = useMemo(() => {
    const conImpuesto = subtotal * (1 + (Number(impuesto) || 0) / 100);
    return Math.max(0, conImpuesto - (Number(anticipo) || 0));
  }, [subtotal, impuesto, anticipo]);

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('carrito');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('carrito');
  };

  const agregarDispositivoDelStock = (d: Dispositivo) => {
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: `${d.modelo || 'Dispositivo'}${d.capacidad_gb ? ` ${d.capacidad_gb}GB` : ''}${
          d.color ? ` ${d.color}` : ''
        }`,
        cantidad: 1,
        precioUnitario: d.precio ?? 0,
        dispositivoId: d.id,
      },
    ]);
    setPanelAbierto(null);
    setBuscarDispositivo('');
  };

  const agregarDispositivoNuevo = async () => {
    if (!nuevoModelo.trim()) return;
    setCargandoDispositivo(true);
    setError(null);
    const { data, error: dErr } = await supabase
      .from('dispositivos')
      .insert({
        modelo: nuevoModelo.trim(),
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim() || null,
        precio: nuevoPrecioDispositivo ? Number(nuevoPrecioDispositivo) : null,
        estado: 'usado',
        en_stock: true,
      })
      .select()
      .single();
    setCargandoDispositivo(false);
    if (dErr || !data) {
      setError('No pudimos cargar el dispositivo: ' + (dErr?.message || ''));
      return;
    }
    setDispositivosStock((s) => [...s, data as Dispositivo]);
    agregarDispositivoDelStock(data as Dispositivo);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoPrecioDispositivo('');
  };

  const agregarProductoDelCatalogo = (p: Producto) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: p.nombre, cantidad: 1, precioUnitario: p.precio ?? 0 },
    ]);
    setPanelAbierto(null);
  };

  const agregarProductoManual = () => {
    if (!productoManualNombre.trim()) return;
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: productoManualNombre.trim(),
        cantidad: Number(productoManualCantidad) || 1,
        precioUnitario: productoManualPrecio ? Number(productoManualPrecio) : 0,
      },
    ]);
    setProductoManualNombre('');
    setProductoManualPrecio('');
    setProductoManualCantidad('1');
    setPanelAbierto(null);
  };

  const quitarDelCarrito = (tempId: string) => setCarrito((c) => c.filter((i) => i.tempId !== tempId));

  const puedeConfirmar = carrito.length > 0;

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);

    try {
      let clienteId = clienteElegido?.id;
      if (modoCliente === 'nuevo') {
        const { data, error: cErr } = await supabase
          .from('clientes')
          .insert({
            nombre: nuevoNombre.trim(),
            apellido: nuevoApellido.trim() || null,
            telefono: nuevoTelefono.trim() || null,
          })
          .select()
          .single();
        if (cErr || !data) throw new Error(cErr?.message || 'no se pudo cargar el cliente');
        clienteId = data.id;
      }

      const { data: orden, error: oErr } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: clienteId,
          vendedor_id: vendedorId || null,
          forma_pago: formaPago,
          anticipo: Number(anticipo) || 0,
          impuesto_porcentaje: Number(impuesto) || 0,
          total,
          estado: estadoOrden,
          fecha_entrega: estadoOrden === 'entregado' ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (oErr || !orden) throw new Error(oErr?.message || 'no se pudo crear la orden');

      const { error: itemsErr } = await supabase.from('orden_items').insert(
        carrito.map((i) => ({
          orden_id: orden.id,
          dispositivo_id: i.dispositivoId || null,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precioUnitario,
        }))
      );
      if (itemsErr) throw new Error(itemsErr.message);

      const dispositivoIds = carrito.map((i) => i.dispositivoId).filter(Boolean) as string[];
      if (dispositivoIds.length > 0) {
        await supabase.from('dispositivos').update({ en_stock: false }).in('id', dispositivoIds);
      }

      router.push(`/ordenes/${orden.id}/boleta`);
    } catch (err: any) {
      setError('No pudimos crear la orden: ' + (err?.message || 'error desconocido'));
      setGuardando(false);
    }
  };

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/ordenes" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">Nueva orden · Cliente</span>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setModoCliente('existente')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'existente' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
            }`}
          >
            Cliente existente
          </button>
          <button
            onClick={() => setModoCliente('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'nuevo' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
            }`}
          >
            Cargar nuevo
          </button>
        </div>

        {modoCliente === 'existente' ? (
          <>
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {clientesFiltrados.length === 0 && (
                <p className="text-sm text-muted text-center mt-4">No encontramos clientes con esa búsqueda.</p>
              )}
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirCliente(c)}
                  className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between text-left"
                >
                  <p className="text-sm font-medium">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted">{c.telefono || ''}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Campo label="Nombre" valor={nuevoNombre} onChange={setNuevoNombre} />
            <Campo label="Apellido" valor={nuevoApellido} onChange={setNuevoApellido} />
            <Campo label="Teléfono" valor={nuevoTelefono} onChange={setNuevoTelefono} />
            <button
              disabled={!nuevoNombre.trim()}
              onClick={confirmarClienteNuevo}
              className="mt-2 w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}
      </main>
    );
  }

  if (step === 'carrito') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setStep('cliente')} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">Nueva orden · Ítems</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'dispositivo' ? null : 'dispositivo')}
            className="flex-1 rounded-xl border border-black/15 py-3 text-sm font-medium"
          >
            + Dispositivo
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'producto' ? null : 'producto')}
            className="flex-1 rounded-xl border border-black/15 py-3 text-sm font-medium"
          >
            + Accesorio / producto
          </button>
        </div>

        {panelAbierto === 'dispositivo' && (
          <div className="rounded-xl border border-black/10 bg-white/60 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoDispositivo('stock')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'stock' ? 'bg-ink text-base' : 'border border-black/10'
                }`}
              >
                Del stock
              </button>
              <button
                onClick={() => setModoDispositivo('nuevo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'nuevo' ? 'bg-ink text-base' : 'border border-black/10'
                }`}
              >
                Cargar nuevo
              </button>
            </div>

            {modoDispositivo === 'stock' ? (
              <>
                <input
                  value={buscarDispositivo}
                  onChange={(e) => setBuscarDispositivo(e.target.value)}
                  placeholder="Buscar por modelo o IMEI..."
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {dispositivosFiltrados.length === 0 && (
                    <p className="text-xs text-muted text-center py-2">No hay dispositivos disponibles.</p>
                  )}
                  {dispositivosFiltrados.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => agregarDispositivoDelStock(d)}
                      className="rounded-lg border border-black/10 bg-white px-3 py-2 flex items-center justify-between text-left text-sm"
                    >
                      <span>
                        {d.modelo} {d.capacidad_gb ? `· ${d.capacidad_gb}GB` : ''} {d.color ? `· ${d.color}` : ''}
                      </span>
                      {d.precio != null && <span className="font-medium">${d.precio.toLocaleString('es-AR')}</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={nuevoModelo}
                  onChange={(e) => setNuevoModelo(e.target.value)}
                  placeholder="Modelo (ej. iPhone 13)"
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  {STORAGE_OPTIONS.map((gb) => (
                    <button
                      key={gb}
                      onClick={() => setNuevaCapacidad(gb)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                        nuevaCapacidad === gb ? 'bg-ink text-base' : 'border border-black/10'
                      }`}
                    >
                      {gb}GB
                    </button>
                  ))}
                </div>
                <input
                  value={nuevoColor}
                  onChange={(e) => setNuevoColor(e.target.value)}
                  placeholder="Color"
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={nuevoPrecioDispositivo}
                  onChange={(e) => setNuevoPrecioDispositivo(e.target.value)}
                  placeholder="Precio"
                  inputMode="numeric"
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!nuevoModelo.trim() || cargandoDispositivo}
                  onClick={agregarDispositivoNuevo}
                  className="w-full rounded-lg bg-ink py-2 text-sm font-medium text-base disabled:opacity-40"
                >
                  {cargandoDispositivo ? 'Agregando...' : 'Agregar al carrito'}
                </button>
              </div>
            )}
          </div>
        )}

        {panelAbierto === 'producto' && (
          <div className="rounded-xl border border-black/10 bg-white/60 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoProducto('catalogo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'catalogo' ? 'bg-ink text-base' : 'border border-black/10'
                }`}
              >
                Del catálogo
              </button>
              <button
                onClick={() => setModoProducto('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'manual' ? 'bg-ink text-base' : 'border border-black/10'
                }`}
              >
                Cargar a mano
              </button>
            </div>

            {modoProducto === 'catalogo' ? (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {productos.length === 0 && (
                  <p className="text-xs text-muted text-center py-2">
                    Todavía no cargaste productos en Configuración.
                  </p>
                )}
                {productos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProductoDelCatalogo(p)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-2 flex items-center justify-between text-left text-sm"
                  >
                    <span>{p.nombre}</span>
                    {p.precio != null && <span className="font-medium">${p.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={productoManualNombre}
                  onChange={(e) => setProductoManualNombre(e.target.value)}
                  placeholder="Nombre del ítem"
                  className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={productoManualCantidad}
                    onChange={(e) => setProductoManualCantidad(e.target.value)}
                    placeholder="Cantidad"
                    inputMode="numeric"
                    className="w-1/3 bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={productoManualPrecio}
                    onChange={(e) => setProductoManualPrecio(e.target.value)}
                    placeholder="Precio unitario"
                    inputMode="numeric"
                    className="flex-1 bg-white border border-black/10 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  disabled={!productoManualNombre.trim()}
                  onClick={agregarProductoManual}
                  className="w-full rounded-lg bg-ink py-2 text-sm font-medium text-base disabled:opacity-40"
                >
                  Agregar al carrito
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {carrito.length === 0 && (
            <p className="text-sm text-muted text-center mt-4">El carrito está vacío. Agregá al menos un ítem.</p>
          )}
          {carrito.map((i) => (
            <div
              key={i.tempId}
              className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium">{i.descripcion}</p>
                <p className="text-xs text-muted">
                  {i.cantidad} × ${i.precioUnitario.toLocaleString('es-AR')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">${(i.cantidad * i.precioUnitario).toLocaleString('es-AR')}</p>
                <button onClick={() => quitarDelCarrito(i.tempId)} className="text-xs text-bad underline">
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>

        {carrito.length > 0 && (
          <div className="flex items-center justify-between text-sm font-medium border-t border-black/10 pt-3">
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString('es-AR')}</span>
          </div>
        )}

        <button
          disabled={carrito.length === 0}
          onClick={() => {
            setAnticipo('');
            setImpuesto('');
            setStep('confirmar');
          }}
          className="mt-auto w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
        >
          Continuar
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => setStep('carrito')} className="text-2xl leading-none">
          &larr;
        </button>
        <span className="text-lg font-medium">Nueva orden · Confirmar</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white/60 border border-black/10 px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted">Cliente:</span>{' '}
          {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
        </p>
        <p>
          <span className="text-muted">Ítems:</span> {carrito.length}
        </p>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Vendedor</label>
        <select
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
          className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
        >
          <option value="">Sin asignar</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Forma de pago</label>
        <div className="flex gap-2">
          {FORMAS_PAGO.map((f) => (
            <button
              key={f}
              onClick={() => setFormaPago(f)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                formaPago === f ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted block mb-1">Anticipo</label>
          <input
            value={anticipo}
            onChange={(e) => setAnticipo(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted block mb-1">Impuesto %</label>
          <input
            value={impuesto}
            onChange={(e) => setImpuesto(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Estado</label>
        <div className="flex gap-2">
          {ESTADOS_ORDEN.map((e) => (
            <button
              key={e}
              onClick={() => setEstadoOrden(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                estadoOrden === e ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-base font-medium border-t border-black/10 pt-3">
        <span>Total</span>
        <span>${total.toLocaleString('es-AR')}</span>
      </div>

      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
      >
        {guardando ? 'Creando orden...' : 'Confirmar orden'}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
