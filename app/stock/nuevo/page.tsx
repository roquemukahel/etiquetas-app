'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { asegurarProveedor } from '../../lib/proveedores';
import { limpiarImei } from '../../lib/imei';
import { getActor, useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import SelectorColor from '../../SelectorColor';

const STORAGE_OPTIONS = [64, 128, 256, 512];
const ESTADOS = ['usado', 'sellado'];

export default function NuevoDispositivo() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actorActual = useActor();
  const puedeAgregarStock = tienePermiso(actorActual, 'agregar_stock');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => {
      const { data } = await supabase.from('proveedores').select('nombre').order('nombre');
      setProveedores((data ?? []).map((p) => p.nombre));
    })();
  }, []);

  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [imei, setImei] = useState('');
  const [bateria, setBateria] = useState('');
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [estado, setEstado] = useState('usado');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const puedeGuardar = modelo.trim().length > 0 && puedeAgregarStock;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);

    const actor = getActor();
    const proveedorId = await asegurarProveedor(supabase, proveedor);
    const { error: insertError } = await supabase.from('dispositivos').insert({
      modelo: modelo.trim(),
      capacidad_gb: capacidad,
      imei: limpiarImei(imei),
      salud_bateria: bateria ? Number(bateria) : null,
      color: color.trim() || null,
      precio: precio ? Number(precio) : null,
      costo: costo ? Number(costo) : null,
      proveedor: proveedor.trim() || null,
      proveedor_id: proveedorId,
      estado,
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
    });

    if (insertError) {
      setError('No pudimos guardar el dispositivo: ' + insertError.message);
      setGuardando(false);
      return;
    }

    await asegurarModelo(supabase, modelo);

    router.push('/stock');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/stock" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Cargar dispositivo</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeAgregarStock && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">No tenés permiso para agregar dispositivos al stock.</p>
      )}

      <div className="flex flex-col gap-3">
        <Campo label="Modelo (carpeta)" valor={modelo} onChange={setModelo} placeholder="iPhone 13" listaId="carpetas-stock" />
        <datalist id="carpetas-stock">
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
                type="button"
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

        <Campo label="IMEI" valor={imei} onChange={setImei} mono />
        <Campo label="Salud de batería (%)" valor={bateria} onChange={setBateria} numerico />
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Color</label>
          <SelectorColor value={color} onChange={setColor} />
        </div>
        <Campo label="Precio" valor={precio} onChange={setPrecio} numerico />
        <Campo label="Costo (lo que le pagaste al proveedor, opcional)" valor={costo} onChange={setCosto} numerico />
        <Campo label="Proveedor (opcional)" valor={proveedor} onChange={setProveedor} listaId="proveedores-stock" />
        <datalist id="proveedores-stock">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Estado</label>
          <div className="flex gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEstado(e)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                  estado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        disabled={!puedeGuardar || guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Agregar al stock'}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
  numerico,
  placeholder,
  listaId,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  placeholder?: string;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listaId}
        inputMode={numerico ? 'numeric' : undefined}
        className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
