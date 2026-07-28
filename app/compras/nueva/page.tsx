'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
};

export default function NuevaCompra() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [step, setStep] = useState<'cliente' | 'dispositivo'>('cliente');

  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoDomicilio, setNuevoDomicilio] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [imei, setImei] = useState('');
  const [detalles, setDetalles] = useState('');
  const [precio, setPrecio] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clientes').select('*');
      setClientes((data as Cliente[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('dispositivo');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('dispositivo');
  };

  const puedeConfirmar = modelo.trim().length > 0;

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
            email: nuevoEmail.trim() || null,
            domicilio: nuevoDomicilio.trim() || null,
            dni: nuevoDni.trim() || null,
          })
          .select()
          .single();
        if (cErr || !data) throw new Error(cErr?.message || 'no se pudo cargar el cliente');
        clienteId = data.id;
      }

      const { data: compra, error: compraErr } = await supabase
        .from('compras')
        .insert({
          cliente_id: clienteId,
          modelo: modelo.trim(),
          capacidad_gb: capacidad,
          imei: imei.trim() || null,
          detalles: detalles.trim() || null,
          precio: precio ? Number(precio) : null,
        })
        .select()
        .single();
      if (compraErr || !compra) throw new Error(compraErr?.message || 'no se pudo crear la compra');

      await asegurarModelo(supabase, modelo);

      router.push(`/compras/${compra.id}/boleta`);
    } catch (err: any) {
      setError('No pudimos guardar la compra: ' + (err?.message || 'error desconocido'));
      setGuardando(false);
    }
  };

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/compras" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">Nueva compra · Cliente</span>
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
            <Campo label="Email" valor={nuevoEmail} onChange={setNuevoEmail} />
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

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => setStep('cliente')} className="text-2xl leading-none">
          &larr;
        </button>
        <span className="text-lg font-medium">Nueva compra · Dispositivo</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card px-4 py-3 text-sm">
        <span className="text-muted dark:text-dark-text-secondary">Cliente: </span>
        {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
      </div>

      <div className="flex flex-col gap-3">
        <Campo label="Modelo (carpeta)" valor={modelo} onChange={setModelo} placeholder="iPhone 13" listaId="carpetas-stock-compra" />
        <datalist id="carpetas-stock-compra">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Almacenamiento</label>
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                onClick={() => setCapacidad(gb)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  capacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {gb} GB
              </button>
            ))}
          </div>
        </div>

        <Campo label="IMEI" valor={imei} onChange={setImei} placeholder="IMEI" />

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Detalles (opcional)</label>
          <textarea
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            placeholder="¿Presenta algún detalle? Ej. pantalla con manchas, batería al 70%..."
            rows={3}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <Campo label="Precio pagado" valor={precio} onChange={setPrecio} numerico />
      </div>

      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Confirmar compra'}
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
  listaId,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numerico?: boolean;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numerico ? 'numeric' : undefined}
        list={listaId}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
