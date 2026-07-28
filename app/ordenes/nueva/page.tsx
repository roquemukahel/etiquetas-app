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

const STORAGE_OPTIONS = [64, 128, 256, 512];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];
const ESTADOS_ORDEN = ['pendiente', 'pagado', 'entregado'];

export default function NuevaOrden() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [step, setStep] = useState<'dispositivo' | 'cliente' | 'pago'>('dispositivo');

  // --- dispositivo ---
  const [modoDispositivo, setModoDispositivo] = useState<'stock' | 'nuevo'>('stock');
  const [buscarDispositivo, setBuscarDispositivo] = useState('');
  const [dispositivosStock, setDispositivosStock] = useState<Dispositivo[]>([]);
  const [dispositivoElegido, setDispositivoElegido] = useState<Dispositivo | null>(null);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');

  // --- cliente ---
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');

  // --- pago ---
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [total, setTotal] = useState('');
  const [estadoOrden, setEstadoOrden] = useState('pendiente');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('dispositivos').select('*').eq('en_stock', true);
      setDispositivosStock((data as Dispositivo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('clientes').select('*');
      setClientes((data as Cliente[]) ?? []);
    })();
  }, []);

  const dispositivosFiltrados = useMemo(() => {
    const q = buscarDispositivo.trim().toLowerCase();
    if (!q) return dispositivosStock;
    return dispositivosStock.filter((d) =>
      [d.modelo, d.imei].filter(Boolean).some((c) => c!.toLowerCase().includes(q))
    );
  }, [dispositivosStock, buscarDispositivo]);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const elegirDispositivo = (d: Dispositivo) => {
    setDispositivoElegido(d);
    if (d.precio != null) setTotal(d.precio.toString());
    setStep('cliente');
  };

  const confirmarDispositivoNuevo = () => {
    if (!nuevoModelo.trim()) return;
    if (nuevoPrecio) setTotal(nuevoPrecio);
    setStep('cliente');
  };

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('pago');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('pago');
  };

  const puedeConfirmar =
    (modoDispositivo === 'stock' ? !!dispositivoElegido : nuevoModelo.trim().length > 0) &&
    (modoCliente === 'existente' ? !!clienteElegido : nuevoNombre.trim().length > 0) &&
    total.trim().length > 0;

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);

    try {
      let dispositivoId = dispositivoElegido?.id;
      if (modoDispositivo === 'nuevo') {
        const { data, error: dErr } = await supabase
          .from('dispositivos')
          .insert({
            modelo: nuevoModelo.trim(),
            capacidad_gb: nuevaCapacidad,
            color: nuevoColor.trim() || null,
            precio: nuevoPrecio ? Number(nuevoPrecio) : null,
            estado: 'usado',
            en_stock: true,
          })
          .select()
          .single();
        if (dErr || !data) throw new Error(dErr?.message || 'no se pudo cargar el dispositivo');
        dispositivoId = data.id;
      }

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

      const { error: oErr } = await supabase.from('ordenes').insert({
        cliente_id: clienteId,
        dispositivo_id: dispositivoId,
        forma_pago: formaPago,
        total: Number(total),
        estado: estadoOrden,
      });
      if (oErr) throw new Error(oErr.message);

      if (dispositivoId) {
        await supabase.from('dispositivos').update({ en_stock: false }).eq('id', dispositivoId);
      }

      router.push('/ordenes');
      router.refresh();
    } catch (err: any) {
      setError('No pudimos crear la orden: ' + (err?.message || 'error desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  if (step === 'dispositivo') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/ordenes" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">Nueva orden · Dispositivo</span>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setModoDispositivo('stock')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoDispositivo === 'stock' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
            }`}
          >
            Elegir del stock
          </button>
          <button
            onClick={() => setModoDispositivo('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoDispositivo === 'nuevo' ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
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
              className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {dispositivosFiltrados.length === 0 && (
                <p className="text-sm text-muted text-center mt-4">No hay dispositivos en stock con esa búsqueda.</p>
              )}
              {dispositivosFiltrados.map((d) => (
                <button
                  key={d.id}
                  onClick={() => elegirDispositivo(d)}
                  className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {d.modelo} {d.capacidad_gb ? `· ${d.capacidad_gb}GB` : ''} {d.color ? `· ${d.color}` : ''}
                    </p>
                    <p className="text-xs text-muted font-mono">{d.imei || 'sin IMEI'}</p>
                  </div>
                  {d.precio != null && <p className="text-sm font-medium">${d.precio.toLocaleString('es-AR')}</p>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Campo label="Modelo" valor={nuevoModelo} onChange={setNuevoModelo} placeholder="iPhone 13" />
            <div>
              <label className="text-xs text-muted block mb-1">Almacenamiento</label>
              <div className="flex gap-2">
                {STORAGE_OPTIONS.map((gb) => (
                  <button
                    key={gb}
                    type="button"
                    onClick={() => setNuevaCapacidad(gb)}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                      nuevaCapacidad === gb ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
                    }`}
                  >
                    {gb} GB
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Color" valor={nuevoColor} onChange={setNuevoColor} />
            <Campo label="Precio" valor={nuevoPrecio} onChange={setNuevoPrecio} numerico />
            <button
              disabled={!nuevoModelo.trim()}
              onClick={confirmarDispositivoNuevo}
              className="mt-2 w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}
      </main>
    );
  }

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setStep('dispositivo')} className="text-2xl leading-none">
            &larr;
          </button>
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

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => setStep('cliente')} className="text-2xl leading-none">
          &larr;
        </button>
        <span className="text-lg font-medium">Nueva orden · Pago</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white/60 border border-black/10 px-4 py-3 text-sm">
        <p>
          <span className="text-muted">Dispositivo:</span>{' '}
          {modoDispositivo === 'stock' ? dispositivoElegido?.modelo : nuevoModelo}
        </p>
        <p>
          <span className="text-muted">Cliente:</span>{' '}
          {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
        </p>
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

      <Campo label="Total" valor={total} onChange={setTotal} numerico />

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
  placeholder,
  numerico,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numerico?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numerico ? 'numeric' : undefined}
        className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
