'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { obtenerTodasLasFilas } from '../../lib/db';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../../lib/carpetas';
import MiniaturaDispositivo from '../../MiniaturaDispositivo';

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  precio: number | null;
  imei: string | null;
  salud_bateria: number | null;
};

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
};

type Vendedor = { id: string; nombre: string };
type Producto = { id: string; nombre: string; precio: number | null };
type Trabajo = { id: string; nombre: string; precio: number | null; imagen_url: string | null };

type ItemCarrito = {
  tempId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  dispositivoId?: string;
  tipo: 'dispositivo' | 'producto' | 'trabajo';
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
  const [nuevoDomicilio, setNuevoDomicilio] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');

  // --- carrito ---
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [panelAbierto, setPanelAbierto] = useState<'dispositivo' | 'producto' | 'trabajo' | null>(null);

  const [dispositivosStock, setDispositivosStock] = useState<Dispositivo[]>([]);
  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [buscarDispositivo, setBuscarDispositivo] = useState('');
  const [modoDispositivo, setModoDispositivo] = useState<'stock' | 'nuevo'>('stock');
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoPrecioDispositivo, setNuevoPrecioDispositivo] = useState('');
  const [nuevoImeiDispositivo, setNuevoImeiDispositivo] = useState('');
  const [cargandoDispositivo, setCargandoDispositivo] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [modoProducto, setModoProducto] = useState<'catalogo' | 'manual'>('catalogo');
  const [productoManualNombre, setProductoManualNombre] = useState('');
  const [productoManualPrecio, setProductoManualPrecio] = useState('');
  const [productoManualCantidad, setProductoManualCantidad] = useState('1');

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [modoTrabajo, setModoTrabajo] = useState<'catalogo' | 'manual'>('catalogo');
  const [trabajoManualNombre, setTrabajoManualNombre] = useState('');
  const [trabajoManualPrecio, setTrabajoManualPrecio] = useState('');
  const [trabajoModelo, setTrabajoModelo] = useState('');

  // --- confirmar ---
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [anticipo, setAnticipo] = useState('');
  const [impuesto, setImpuesto] = useState('');
  const [estadoOrden, setEstadoOrden] = useState('pendiente');
  const [nota, setNota] = useState('');
  const [incluirGarantia, setIncluirGarantia] = useState(true);

  // --- plan canje ---
  const [canjeActivo, setCanjeActivo] = useState(false);
  const [canjeModelo, setCanjeModelo] = useState('');
  const [canjeCapacidad, setCanjeCapacidad] = useState<number | null>(null);
  const [canjeColor, setCanjeColor] = useState('');
  const [canjeImei, setCanjeImei] = useState('');
  const [canjeBateria, setCanjeBateria] = useState('');
  const [canjeMonto, setCanjeMonto] = useState('');
  const [canjeDetalles, setCanjeDetalles] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [garantiaDias, setGarantiaDias] = useState<number | null>(null);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( garantia_dias )').eq('id', user.id).single();
      setGarantiaDias((perfil as any)?.negocios?.garantia_dias ?? null);
    })();
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', '*'));
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
    (async () => {
      const { data } = await supabase.from('trabajos').select('*').order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetasStock((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
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
    const montoCanje = canjeActivo ? Number(canjeMonto) || 0 : 0;
    // Sin Math.max(0, ...) a propósito: si el anticipo es mayor al precio
    // (ej. seña de una compra anterior más grande que lo que se lleva hoy),
    // el total puede quedar negativo — representa saldo a favor del cliente.
    return conImpuesto - (Number(anticipo) || 0) - montoCanje;
  }, [subtotal, impuesto, anticipo, canjeActivo, canjeMonto]);

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
        }${d.imei ? ` · IMEI ${d.imei}` : ''}${d.salud_bateria != null ? ` · Batería ${d.salud_bateria}%` : ''}`,
        cantidad: 1,
        precioUnitario: d.precio ?? 0,
        dispositivoId: d.id,
        tipo: 'dispositivo',
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
        imei: nuevoImeiDispositivo.trim() || null,
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
    await asegurarModelo(supabase, nuevoModelo);
    setDispositivosStock((s) => [...s, data as Dispositivo]);
    agregarDispositivoDelStock(data as Dispositivo);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoImeiDispositivo('');
    setNuevoPrecioDispositivo('');
  };

  const agregarProductoDelCatalogo = (p: Producto) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: p.nombre, cantidad: 1, precioUnitario: p.precio ?? 0, tipo: 'producto' },
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
        tipo: 'producto',
      },
    ]);
    setProductoManualNombre('');
    setProductoManualPrecio('');
    setProductoManualCantidad('1');
    setPanelAbierto(null);
  };

  const descripcionTrabajo = (nombre: string) => (trabajoModelo.trim() ? `${nombre} — ${trabajoModelo.trim()}` : nombre);

  const agregarTrabajoDelCatalogo = (t: Trabajo) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: descripcionTrabajo(t.nombre), cantidad: 1, precioUnitario: t.precio ?? 0, tipo: 'trabajo' },
    ]);
    setTrabajoModelo('');
    setPanelAbierto(null);
  };

  const agregarTrabajoManual = () => {
    if (!trabajoManualNombre.trim()) return;
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: descripcionTrabajo(trabajoManualNombre.trim()),
        cantidad: 1,
        precioUnitario: trabajoManualPrecio ? Number(trabajoManualPrecio) : 0,
        tipo: 'trabajo',
      },
    ]);
    setTrabajoManualNombre('');
    setTrabajoManualPrecio('');
    setTrabajoModelo('');
    setPanelAbierto(null);
  };

  const quitarDelCarrito = (tempId: string) => setCarrito((c) => c.filter((i) => i.tempId !== tempId));

  const actualizarPrecioItem = (tempId: string, precio: string) =>
    setCarrito((c) => c.map((i) => (i.tempId === tempId ? { ...i, precioUnitario: Number(precio) || 0 } : i)));

  const actualizarCantidadItem = (tempId: string, cantidad: string) =>
    setCarrito((c) => c.map((i) => (i.tempId === tempId ? { ...i, cantidad: Math.max(1, Number(cantidad) || 1) } : i)));

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
            domicilio: nuevoDomicilio.trim() || null,
            dni: nuevoDni.trim() || null,
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
          monto_canje: canjeActivo ? Number(canjeMonto) || 0 : 0,
          total,
          estado: estadoOrden,
          fecha_entrega: estadoOrden === 'entregado' ? new Date().toISOString() : null,
          nota: nota.trim() || null,
          incluir_garantia: incluirGarantia,
        })
        .select()
        .single();
      if (oErr || !orden) throw new Error(oErr?.message || 'no se pudo crear la orden');

      if (canjeActivo && canjeModelo.trim()) {
        const { data: canjeData, error: canjeErr } = await supabase
          .from('canjes')
          .insert({
            orden_id: orden.id,
            modelo: canjeModelo.trim(),
            capacidad_gb: canjeCapacidad,
            color: canjeColor.trim() || null,
            imei: canjeImei.trim() || null,
            salud_bateria: canjeBateria ? Number(canjeBateria) : null,
            detalles: canjeDetalles.trim() || null,
            monto: canjeMonto ? Number(canjeMonto) : null,
            vendedor_id: vendedorId || null,
          })
          .select()
          .single();
        if (canjeErr || !canjeData) throw new Error(canjeErr?.message || 'no se pudo cargar el dispositivo de canje');
        await supabase.from('ordenes').update({ canje_id: canjeData.id }).eq('id', orden.id);
      }

      const { error: itemsErr } = await supabase.from('orden_items').insert(
        carrito.map((i) => ({
          orden_id: orden.id,
          dispositivo_id: i.dispositivoId || null,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precioUnitario,
          tipo: i.tipo,
        }))
      );
      if (itemsErr) throw new Error(itemsErr.message);

      const dispositivoIds = carrito.map((i) => i.dispositivoId).filter(Boolean) as string[];
      if (dispositivoIds.length > 0) {
        const actualizacion: { en_stock: boolean; garantia_vencimiento?: string } = { en_stock: false };
        if (garantiaDias) {
          const vencimiento = new Date();
          vencimiento.setDate(vencimiento.getDate() + garantiaDias);
          actualizacion.garantia_vencimiento = vencimiento.toISOString().slice(0, 10);
        }
        await supabase.from('dispositivos').update(actualizacion).in('id', dispositivoIds);
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
              modoCliente === 'existente' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            Cliente existente
          </button>
          <button
            onClick={() => setModoCliente('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
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
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {clientesFiltrados.length === 0 && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">No encontramos clientes con esa búsqueda.</p>
              )}
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirCliente(c)}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-left"
                >
                  <p className="text-sm font-medium">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{c.telefono || ''}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Campo label="Nombre" valor={nuevoNombre} onChange={setNuevoNombre} />
            <Campo label="Apellido" valor={nuevoApellido} onChange={setNuevoApellido} />
            <Campo label="Teléfono" valor={nuevoTelefono} onChange={setNuevoTelefono} />
            <Campo label="Domicilio" valor={nuevoDomicilio} onChange={setNuevoDomicilio} />
            <Campo label="DNI" valor={nuevoDni} onChange={setNuevoDni} />
            <button
              disabled={!nuevoNombre.trim()}
              onClick={confirmarClienteNuevo}
              className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
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
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + Dispositivo
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'producto' ? null : 'producto')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + Accesorio / producto
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'trabajo' ? null : 'trabajo')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + Servicio técnico
          </button>
        </div>

        {panelAbierto === 'dispositivo' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoDispositivo('stock')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'stock' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del stock
              </button>
              <button
                onClick={() => setModoDispositivo('nuevo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
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
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {dispositivosFiltrados.length === 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">No hay dispositivos disponibles.</p>
                  )}
                  {dispositivosFiltrados.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => agregarDispositivoDelStock(d)}
                      className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                      <MiniaturaDispositivo src={imagenPorNombreExacto(d.modelo, imagenesCarpetas)} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {d.modelo} {d.capacidad_gb ? `· ${d.capacidad_gb}GB` : ''} {d.color ? `· ${d.color}` : ''}
                        </span>
                        {d.imei && (
                          <span className="block text-xs font-bold font-mono text-ink dark:text-dark-text truncate">
                            {d.imei}
                          </span>
                        )}
                      </span>
                      </span>
                      {d.precio != null && (
                        <span className="font-medium shrink-0">${d.precio.toLocaleString('es-AR')}</span>
                      )}
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
                  list="carpetas-stock"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <datalist id="carpetas-stock">
                  {carpetasStock.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <div className="flex gap-2">
                  {STORAGE_OPTIONS.map((gb) => (
                    <button
                      key={gb}
                      onClick={() => setNuevaCapacidad(gb)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                        nuevaCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
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
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={nuevoImeiDispositivo}
                  onChange={(e) => setNuevoImeiDispositivo(e.target.value)}
                  placeholder="IMEI"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={nuevoPrecioDispositivo}
                  onChange={(e) => setNuevoPrecioDispositivo(e.target.value)}
                  placeholder="Precio"
                  inputMode="numeric"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!nuevoModelo.trim() || cargandoDispositivo}
                  onClick={agregarDispositivoNuevo}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {cargandoDispositivo ? 'Agregando...' : 'Agregar al carrito'}
                </button>
              </div>
            )}
          </div>
        )}

        {panelAbierto === 'producto' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoProducto('catalogo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'catalogo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del catálogo
              </button>
              <button
                onClick={() => setModoProducto('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Cargar a mano
              </button>
            </div>

            {modoProducto === 'catalogo' ? (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {productos.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    Todavía no cargaste productos en Stock &gt; Accesorios.
                  </p>
                )}
                {productos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProductoDelCatalogo(p)}
                    className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm"
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
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={productoManualCantidad}
                    onChange={(e) => setProductoManualCantidad(e.target.value)}
                    placeholder="Cantidad"
                    inputMode="numeric"
                    className="w-1/3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={productoManualPrecio}
                    onChange={(e) => setProductoManualPrecio(e.target.value)}
                    placeholder="Precio unitario"
                    inputMode="numeric"
                    className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  disabled={!productoManualNombre.trim()}
                  onClick={agregarProductoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar al carrito
                </button>
              </div>
            )}
          </div>
        )}

        {panelAbierto === 'trabajo' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoTrabajo('catalogo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoTrabajo === 'catalogo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del catálogo
              </button>
              <button
                onClick={() => setModoTrabajo('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoTrabajo === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Cargar a mano
              </button>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                Modelo del equipo (opcional, ej. iPhone 13)
              </label>
              <input
                value={trabajoModelo}
                onChange={(e) => setTrabajoModelo(e.target.value)}
                placeholder="¿A qué iPhone se le hace el arreglo?"
                list="carpetas-stock-trabajo"
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="carpetas-stock-trabajo">
                {carpetasStock.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {modoTrabajo === 'catalogo' ? (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {trabajos.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    Todavía no cargaste trabajos en Servicio Técnico.
                  </p>
                )}
                {trabajos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => agregarTrabajoDelCatalogo(t)}
                    className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm gap-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MiniaturaDispositivo src={t.imagen_url} size={28} />
                      <span className="truncate">{t.nombre}</span>
                    </span>
                    {t.precio != null && <span className="font-medium shrink-0">${t.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={trabajoManualNombre}
                  onChange={(e) => setTrabajoManualNombre(e.target.value)}
                  placeholder="Nombre del arreglo"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={trabajoManualPrecio}
                  onChange={(e) => setTrabajoManualPrecio(e.target.value)}
                  placeholder="Precio"
                  inputMode="numeric"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!trabajoManualNombre.trim()}
                  onClick={agregarTrabajoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar al carrito
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {carrito.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">El carrito está vacío. Agregá al menos un ítem.</p>
          )}
          {carrito.map((i) => (
            <div
              key={i.tempId}
              className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{i.descripcion}</p>
                <div className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary mt-0.5">
                  <input
                    value={i.cantidad}
                    onChange={(e) => actualizarCantidadItem(i.tempId, e.target.value)}
                    inputMode="numeric"
                    className="w-12 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-1 py-0.5 text-xs text-center"
                  />
                  <span>×</span>
                  <span>$</span>
                  <input
                    value={i.precioUnitario}
                    onChange={(e) => actualizarPrecioItem(i.tempId, e.target.value)}
                    inputMode="numeric"
                    className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-1 py-0.5 text-xs"
                  />
                </div>
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
          <div className="flex items-center justify-between text-sm font-medium border-t border-border dark:border-dark-border pt-3">
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
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
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

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Cliente:</span>{' '}
          {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
        </p>
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Ítems:</span> {carrito.length}
        </p>
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Vendedor</label>
        <select
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
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
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Forma de pago</label>
        <div className="flex gap-2">
          {FORMAS_PAGO.map((f) => (
            <button
              key={f}
              onClick={() => setFormaPago(f)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                formaPago === f ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Anticipo</label>
          <input
            value={anticipo}
            onChange={(e) => setAnticipo(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Impuesto %</label>
          <input
            value={impuesto}
            onChange={(e) => setImpuesto(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
          Nota para la boleta (opcional)
        </label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Ej. el equipo tiene un detalle en la pantalla, se vende igual con este descuento"
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={incluirGarantia}
            onChange={(e) => setIncluirGarantia(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">Incluir el texto de garantía en la boleta</span>
        </label>
        <Link
          href="/configuracion/negocio"
          target="_blank"
          className="text-xs text-accent dark:text-dark-accent underline shrink-0"
        >
          Editar texto
        </Link>
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={canjeActivo}
            onChange={(e) => setCanjeActivo(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">Plan canje: recibo un dispositivo como parte de pago</span>
        </label>

        {canjeActivo && (
          <div className="flex flex-col gap-2">
            <input
              value={canjeModelo}
              onChange={(e) => setCanjeModelo(e.target.value)}
              placeholder="Modelo del dispositivo entregado"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              {STORAGE_OPTIONS.map((gb) => (
                <button
                  key={gb}
                  onClick={() => setCanjeCapacidad(gb)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    canjeCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  {gb}GB
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={canjeColor}
                onChange={(e) => setCanjeColor(e.target.value)}
                placeholder="Color"
                className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={canjeBateria}
                onChange={(e) => setCanjeBateria(e.target.value)}
                placeholder="Batería %"
                inputMode="numeric"
                className="w-24 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input
              value={canjeImei}
              onChange={(e) => setCanjeImei(e.target.value)}
              placeholder="IMEI"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <input
              value={canjeMonto}
              onChange={(e) => setCanjeMonto(e.target.value)}
              placeholder="Monto reconocido"
              inputMode="numeric"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={canjeDetalles}
              onChange={(e) => setCanjeDetalles(e.target.value)}
              placeholder="Detalles del dispositivo (ej. no anda el parlante, módulo con detalle)"
              rows={3}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              El dispositivo entregado va a la sección Plan Canje (no entra directo al stock).
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Estado</label>
        <div className="flex gap-2">
          {ESTADOS_ORDEN.map((e) => (
            <button
              key={e}
              onClick={() => setEstadoOrden(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                estadoOrden === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-lg font-medium border-t border-border dark:border-dark-border pt-3">
        <span>Total</span>
        <span>${total.toLocaleString('es-AR')}</span>
      </div>

      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
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
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
